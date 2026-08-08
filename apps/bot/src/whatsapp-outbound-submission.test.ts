import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  classifyWhatsAppOutboundDelivery,
  InMemoryWhatsAppOutboundAckStateStore,
  normalizeWhatsAppMessageId,
  submitWhatsAppMessageWithServerAck,
  WhatsAppOutboundAckCoordinator,
  WhatsAppOutboundSubmissionError,
  type WhatsAppOutboundAckState,
  type WhatsAppSubmissionClient,
  type WhatsAppSubmissionMessage,
} from "./whatsapp-outbound-submission.js";

const OWNER = "owner@c.us";
const OWNER_LID = "1234567890123456789@lid";

function projectedMessage(
  id: string,
  recipient = OWNER,
  ack = 0,
  extra: Partial<WhatsAppSubmissionMessage> = {},
): WhatsAppSubmissionMessage {
  return {
    id: { $1: id, remote: recipient, fromMe: true, id: id.split("_").at(-2) ?? id, self: "XYZ" },
    to: recipient,
    fromMe: true,
    ack,
    ...extra,
  };
}

function legacyMessage(
  id: string,
  recipient = OWNER,
  ack = 0,
): WhatsAppSubmissionMessage {
  return { id: { _serialized: id }, to: recipient, fromMe: true, ack };
}

function stringKeyMessage(
  id: string,
  recipient = OWNER,
  ack = 0,
): WhatsAppSubmissionMessage {
  return { id: { toString: () => id }, to: recipient, fromMe: true, ack };
}

class FakeWhatsAppClient extends EventEmitter implements WhatsAppSubmissionClient {
  readonly calls: Array<{ target: string; body: string; options: { waitUntilMsgSent: true } }> = [];
  sendImpl: (
    target: string,
    body: string,
    options: { waitUntilMsgSent: true },
  ) => Promise<WhatsAppSubmissionMessage | undefined>;

  constructor(result: WhatsAppSubmissionMessage | undefined = undefined) {
    super();
    this.sendImpl = async () => result;
  }

  async sendMessage(
    target: string,
    body: string,
    options: { waitUntilMsgSent: true },
  ): Promise<WhatsAppSubmissionMessage | undefined> {
    this.calls.push({ target, body, options });
    return this.sendImpl(target, body, options);
  }
}

class RecordingStore extends InMemoryWhatsAppOutboundAckStateStore {
  readonly events: string[] = [];

  override async save(state: WhatsAppOutboundAckState): Promise<void> {
    this.events.push("persist");
    await super.save(state);
  }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("test condition timed out");
    await flush();
  }
}

describe("WhatsApp outbound delivery evidence", () => {
  it.each([
    [{}, "no_evidence"],
    [{ localSelfEchoObserved: true }, "local_self_echo_only"],
    [{ localSelfEchoObserved: true, clientAccepted: true }, "client_accepted_without_id"],
    [{ clientAccepted: true, messageId: "msg-1", ack: 0 }, "message_id_created_pending_ack"],
    [{ messageId: "msg-1", ack: 1 }, "server_submitted"],
    [{ messageId: "msg-1", ack: 2 }, "device_acknowledged"],
    [{ messageId: "msg-1", ack: 0, userVisibleConfirmed: true }, "user_visible_confirmed"],
  ])("classifies %o as %s", (evidence, expected) => {
    expect(classifyWhatsAppOutboundDelivery(evidence)).toBe(expected);
  });
});

describe("current WhatsApp message-key normalization", () => {
  it("uses current projected $1 before the plain-object toString", () => {
    expect(normalizeWhatsAppMessageId({
      $1: "true_1234567890123456789@lid_CURRENT_XYZ",
      fromMe: true,
      remote: OWNER_LID,
      id: "CURRENT",
      self: "XYZ",
    })).toBe("true_1234567890123456789@lid_CURRENT_XYZ");
  });

  it("supports legacy serialized IDs, raw toString IDs, and structured fallback", () => {
    expect(normalizeWhatsAppMessageId({ _serialized: "legacy-id" })).toBe("legacy-id");
    expect(normalizeWhatsAppMessageId({ toString: () => "raw-id" })).toBe("raw-id");
    expect(normalizeWhatsAppMessageId({
      fromMe: true,
      remote: OWNER_LID,
      id: "TOKEN",
      self: "SEL",
    })).toBe("true_1234567890123456789@lid_TOKEN_SEL");
  });

  it("rejects the default object string as an ID", () => {
    expect(normalizeWhatsAppMessageId({})).toBe("");
  });
});

describe("WhatsAppOutboundAckCoordinator", () => {
  it("registers observation and persists pending state before submission", async () => {
    const store = new RecordingStore();
    const client = new FakeWhatsAppClient();
    const coordinator = new WhatsAppOutboundAckCoordinator({ store });
    coordinator.attach(client);
    client.sendImpl = async () => {
      expect(client.listenerCount("message_ack")).toBeGreaterThan(0);
      expect(client.listenerCount("message_create")).toBeGreaterThan(0);
      expect(store.events).toEqual(["persist"]);
      client.emit("message_ack", projectedMessage("msg-before"), 1);
      return projectedMessage("msg-before");
    };

    await expect(coordinator.submit(client, {
      target: OWNER,
      body: "sanitized fixture one",
      ackTimeoutMs: 500,
    })).resolves.toMatchObject({ id: "msg-before", ack: 1, delivery: "server_submitted" });
    expect(client.calls[0]?.options).toEqual({ waitUntilMsgSent: true });
  });

  it("fails closed without submitting when pending state cannot be persisted", async () => {
    const client = new FakeWhatsAppClient(projectedMessage("must-not-send", OWNER, 1));
    const coordinator = new WhatsAppOutboundAckCoordinator({
      store: {
        load: async () => undefined,
        save: async () => { throw new Error("persistence unavailable"); },
      },
    });
    coordinator.attach(client);

    await expect(coordinator.submit(client, {
      target: OWNER,
      body: "sanitized blocked persistence fixture",
    })).rejects.toThrow("persistence unavailable");
    expect(client.calls).toHaveLength(0);
  });

  it("correlates an ACK before sendMessage resolves", async () => {
    const client = new FakeWhatsAppClient();
    const coordinator = new WhatsAppOutboundAckCoordinator();
    coordinator.attach(client);
    client.sendImpl = async () => {
      client.emit("message_ack", projectedMessage("msg-early"), 1);
      await flush();
      return projectedMessage("msg-early");
    };

    await expect(coordinator.submit(client, {
      target: OWNER,
      body: "sanitized fixture early",
    })).resolves.toMatchObject({ id: "msg-early", ack: 1 });
  });

  it("correlates an ACK immediately after sendMessage resolves", async () => {
    const client = new FakeWhatsAppClient(projectedMessage("msg-after"));
    const coordinator = new WhatsAppOutboundAckCoordinator();
    coordinator.attach(client);
    const submission = coordinator.submit(client, {
      target: OWNER,
      body: "sanitized fixture after",
      ackTimeoutMs: 500,
    });
    await waitFor(() => client.calls.length === 1);
    await flush();
    client.emit("message_ack", projectedMessage("msg-after"), 1);

    await expect(submission).resolves.toMatchObject({ id: "msg-after", ack: 1 });
  });

  it("correlates ACKs emitted under raw id.toString format", async () => {
    const client = new FakeWhatsAppClient(stringKeyMessage("msg-string"));
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: OWNER,
      body: "sanitized fixture string key",
      ackTimeoutMs: 500,
    });
    await flush();
    client.emit("message_ack", stringKeyMessage("msg-string"), 1);
    await expect(submission).resolves.toMatchObject({ id: "msg-string", ack: 1 });
  });

  it("correlates ACKs emitted under legacy serialized format", async () => {
    const client = new FakeWhatsAppClient(legacyMessage("msg-legacy"));
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: OWNER,
      body: "sanitized fixture legacy key",
      ackTimeoutMs: 500,
    });
    await flush();
    client.emit("message_ack", legacyMessage("msg-legacy"), 1);
    await expect(submission).resolves.toMatchObject({ id: "msg-legacy", ack: 1 });
  });

  it("ignores a mismatched ACK ID", async () => {
    const client = new FakeWhatsAppClient(projectedMessage("msg-right"));
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: OWNER,
      body: "sanitized fixture mismatch",
      ackTimeoutMs: 15,
    });
    await flush();
    client.emit("message_ack", projectedMessage("msg-wrong"), 2);
    await expect(submission).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "ack_timeout",
    });
  });

  it("ignores the right ACK ID from the wrong recipient", async () => {
    const client = new FakeWhatsAppClient(projectedMessage("msg-recipient", OWNER));
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: OWNER,
      body: "sanitized fixture wrong recipient",
      ackTimeoutMs: 15,
    });
    await flush();
    client.emit("message_ack", projectedMessage("msg-recipient", "other@c.us"), 2);
    await expect(submission).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "ack_timeout",
    });
  });

  it("deduplicates ACKs and never regresses an ACK progression", async () => {
    const store = new InMemoryWhatsAppOutboundAckStateStore();
    const client = new FakeWhatsAppClient(projectedMessage("msg-progress"));
    const coordinator = new WhatsAppOutboundAckCoordinator({ store });
    coordinator.attach(client);
    const submission = coordinator.submit(client, {
      target: OWNER,
      body: "sanitized fixture progression",
      ackTimeoutMs: 500,
    });
    await flush();
    client.emit("message_ack", projectedMessage("msg-progress"), 1);
    await expect(submission).resolves.toMatchObject({ ack: 1 });
    client.emit("message_ack", projectedMessage("msg-progress"), 1);
    client.emit("message_ack", projectedMessage("msg-progress"), 2);
    client.emit("message_ack", projectedMessage("msg-progress"), 1);
    await flush();

    const state = await coordinator.getState();
    expect(state.attempts.at(-1)?.ack).toBe(2);
  });

  it("records an ACK after the deadline as late without changing the bounded result", async () => {
    const store = new InMemoryWhatsAppOutboundAckStateStore();
    const client = new FakeWhatsAppClient(projectedMessage("msg-late"));
    const coordinator = new WhatsAppOutboundAckCoordinator({ store });
    coordinator.attach(client);
    await expect(coordinator.submit(client, {
      target: OWNER,
      body: "sanitized fixture late",
      ackTimeoutMs: 10,
    })).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({ code: "ack_timeout" });

    client.emit("message_ack", projectedMessage("msg-late"), 1);
    await waitFor(() => store.state?.attempts.at(-1)?.lateAck === true);
    expect(store.state?.attempts.at(-1)).toMatchObject({ ack: 1, lateAck: true });
  });

  it("recovers a bound pending attempt and observes its ACK after restart", async () => {
    const store = new InMemoryWhatsAppOutboundAckStateStore();
    const firstClient = new FakeWhatsAppClient(projectedMessage("msg-restart"));
    const first = new WhatsAppOutboundAckCoordinator({ store });
    first.attach(firstClient);
    const abandoned = first.submit(firstClient, {
      target: OWNER,
      body: "sanitized fixture restart",
      ackTimeoutMs: 25,
    });
    void abandoned.catch(() => undefined);
    await waitFor(() => Boolean(store.state?.attempts.at(-1)?.messageIdHash));
    first.detach();

    const secondClient = new FakeWhatsAppClient();
    const recovered = new WhatsAppOutboundAckCoordinator({ store });
    recovered.attach(secondClient);
    await recovered.getState();
    secondClient.emit("message_ack", projectedMessage("msg-restart"), 1);
    await waitFor(() => store.state?.attempts.at(-1)?.ack === 1);
    expect(store.state?.attempts.at(-1)?.ack).toBe(1);
    expect(store.state?.attempts.at(-1)?.lateAck).not.toBe(true);
    await expect(abandoned).rejects.toMatchObject({ code: "ack_timeout" });
  });

  it("correlates current linked-device self-chat LID identity", async () => {
    const id = "true_1234567890123456789@lid_LINKED_XYZ";
    const client = new FakeWhatsAppClient(projectedMessage(id, OWNER_LID));
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: OWNER,
      body: "sanitized linked-device fixture",
      ackTimeoutMs: 500,
    });
    await flush();
    client.emit("message_ack", projectedMessage(id, OWNER_LID), 2);
    await expect(submission).resolves.toMatchObject({
      id,
      ack: 2,
      delivery: "device_acknowledged",
    });
  });

  it("records local self-echo but never treats it as delivery", async () => {
    const store = new InMemoryWhatsAppOutboundAckStateStore();
    const client = new FakeWhatsAppClient();
    const coordinator = new WhatsAppOutboundAckCoordinator({ store });
    coordinator.attach(client);
    client.sendImpl = async (_target, body) => {
      client.emit("message_create", projectedMessage("msg-echo", OWNER, 0, { body }));
      return projectedMessage("msg-echo");
    };
    await expect(coordinator.submit(client, {
      target: OWNER,
      body: "sanitized self-echo fixture",
      ackTimeoutMs: 10,
    })).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({ code: "ack_timeout" });
    const attempt = store.state?.attempts.at(-1);
    expect(attempt).toMatchObject({ localSelfEchoObserved: true, ack: 0 });
    expect(classifyWhatsAppOutboundDelivery({
      localSelfEchoObserved: attempt?.localSelfEchoObserved,
      clientAccepted: attempt?.clientAccepted,
      messageId: attempt?.messageIdHash,
      ack: attempt?.ack,
    })).toBe("message_id_created_pending_ack");
  });

  it("stores manual phone visibility separately from missing ACK", async () => {
    const store = new InMemoryWhatsAppOutboundAckStateStore();
    const client = new FakeWhatsAppClient(projectedMessage("msg-manual"));
    const coordinator = new WhatsAppOutboundAckCoordinator({ store });
    coordinator.attach(client);
    await expect(coordinator.submit(client, {
      target: OWNER,
      body: "sanitized manual fixture",
      ackTimeoutMs: 10,
    })).rejects.toMatchObject({ code: "ack_timeout" });
    const attemptId = store.state!.attempts.at(-1)!.attemptId;
    await coordinator.confirmUserVisible(attemptId);
    const attempt = store.state!.attempts.at(-1)!;
    expect(attempt.ack).toBe(0);
    expect(classifyWhatsAppOutboundDelivery({
      messageId: attempt.messageIdHash,
      ack: attempt.ack,
      userVisibleConfirmed: attempt.userVisibleConfirmed,
    })).toBe("user_visible_confirmed");
  });

  it("serializes four concurrent sends without cross-correlation", async () => {
    const client = new FakeWhatsAppClient();
    const coordinator = new WhatsAppOutboundAckCoordinator();
    coordinator.attach(client);
    let active = 0;
    let maxActive = 0;
    let sequence = 0;
    client.sendImpl = async (_target, body) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const id = `msg-concurrent-${++sequence}`;
      client.emit("message_create", projectedMessage(id, OWNER, 0, { body }));
      client.emit("message_ack", projectedMessage(id), sequence % 2 === 0 ? 2 : 1);
      await flush();
      active -= 1;
      return projectedMessage(id);
    };

    const results = await Promise.all([1, 2, 3, 4].map((index) => coordinator.submit(client, {
      target: OWNER,
      body: `sanitized concurrent fixture ${index}`,
      ackTimeoutMs: 500,
    })));
    expect(results.map((result) => [result.id, result.ack])).toEqual([
      ["msg-concurrent-1", 1],
      ["msg-concurrent-2", 2],
      ["msg-concurrent-3", 1],
      ["msg-concurrent-4", 2],
    ]);
    expect(maxActive).toBe(1);
  });

  it("rejects local acceptance without a real ID", async () => {
    const client = new FakeWhatsAppClient({ to: OWNER, ack: 0 });
    await expect(submitWhatsAppMessageWithServerAck(client, {
      target: OWNER,
      body: "sanitized missing id fixture",
    })).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "message_id_missing",
    });
  });

  it("rejects a real ACK error", async () => {
    const client = new FakeWhatsAppClient(projectedMessage("msg-error", OWNER, -1));
    await expect(submitWhatsAppMessageWithServerAck(client, {
      target: OWNER,
      body: "sanitized ack error fixture",
    })).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({ code: "ack_error" });
  });

  it("persists no raw recipient, message ID, or body", async () => {
    const store = new InMemoryWhatsAppOutboundAckStateStore();
    const client = new FakeWhatsAppClient(projectedMessage("sensitive-message-id", OWNER, 1));
    const coordinator = new WhatsAppOutboundAckCoordinator({ store });
    coordinator.attach(client);
    await coordinator.submit(client, {
      target: OWNER,
      body: "sensitive fixture body",
    });
    const serialized = JSON.stringify(store.state);
    expect(serialized).not.toContain(OWNER);
    expect(serialized).not.toContain("sensitive-message-id");
    expect(serialized).not.toContain("sensitive fixture body");
  });
});
