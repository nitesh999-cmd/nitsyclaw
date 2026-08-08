import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  classifyWhatsAppOutboundDelivery,
  submitWhatsAppMessageWithServerAck,
  WhatsAppOutboundSubmissionError,
  type WhatsAppSubmissionClient,
  type WhatsAppSubmissionMessage,
} from "./whatsapp-outbound-submission.js";

class FakeWhatsAppClient extends EventEmitter implements WhatsAppSubmissionClient {
  readonly calls: Array<{ target: string; body: string; options: { waitUntilMsgSent: true } }> = [];

  constructor(private readonly result: WhatsAppSubmissionMessage | undefined) {
    super();
  }

  async sendMessage(
    target: string,
    body: string,
    options: { waitUntilMsgSent: true },
  ): Promise<WhatsAppSubmissionMessage | undefined> {
    this.calls.push({ target, body, options });
    return this.result;
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
    [{ messageId: "msg-1", ack: 2, userVisibleConfirmed: true }, "user_visible_confirmed"],
  ])("classifies %o as %s", (evidence, expected) => {
    expect(classifyWhatsAppOutboundDelivery(evidence)).toBe(expected);
  });
});

describe("submitWhatsAppMessageWithServerAck", () => {
  it("requires waitUntilMsgSent, a real ID, and a server ACK", async () => {
    const client = new FakeWhatsAppClient({ id: { _serialized: "msg-1" }, ack: 0 });
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: "owner@c.us",
      body: "sanitized test body",
      ackTimeoutMs: 1_000,
    });

    client.emit("message_create", { id: { _serialized: "msg-1" }, ack: 0 });
    client.emit("message_ack", { id: { _serialized: "msg-1" } }, 0);
    await new Promise<void>((resolve) => setImmediate(resolve));
    client.emit("message_ack", { id: { _serialized: "msg-1" } }, 1);

    await expect(submission).resolves.toEqual({
      id: "msg-1",
      ack: 1,
      delivery: "server_submitted",
    });
    expect(client.calls).toEqual([{
      target: "owner@c.us",
      body: "sanitized test body",
      options: { waitUntilMsgSent: true },
    }]);
  });

  it("accepts the current WhatsApp Web message-key toString representation", async () => {
    const client = new FakeWhatsAppClient({
      id: { toString: () => "true_owner@c.us_CURRENT-ID" },
      ack: 1,
    });

    await expect(submitWhatsAppMessageWithServerAck(client, {
      target: "owner@c.us",
      body: "sanitized test body",
    })).resolves.toEqual({
      id: "true_owner@c.us_CURRENT-ID",
      ack: 1,
      delivery: "server_submitted",
    });
  });

  it("rejects local client acceptance without a real message ID", async () => {
    const client = new FakeWhatsAppClient({ ack: 0 });
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: "owner@c.us",
      body: "sanitized test body",
    });

    await expect(submission).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "message_id_missing",
    });
  });

  it("does not treat the default object string as a message ID", async () => {
    const client = new FakeWhatsAppClient({ id: {}, ack: 1 });

    await expect(submitWhatsAppMessageWithServerAck(client, {
      target: "owner@c.us",
      body: "sanitized test body",
    })).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "message_id_missing",
    });
  });

  it("rejects a real WhatsApp ACK error", async () => {
    const client = new FakeWhatsAppClient({ id: { _serialized: "msg-2" }, ack: -1 });
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: "owner@c.us",
      body: "sanitized test body",
    });

    await expect(submission).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "ack_error",
    });
  });

  it("rejects an ACK error event after message ID creation", async () => {
    const client = new FakeWhatsAppClient({ id: { _serialized: "msg-2-event" }, ack: 0 });
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: "owner@c.us",
      body: "sanitized test body",
      ackTimeoutMs: 1_000,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    client.emit("message_ack", { id: { _serialized: "msg-2-event" } }, -1);

    await expect(submission).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "ack_error",
    });
  });

  it("does not misclassify ID creation without an ACK as submission", async () => {
    const client = new FakeWhatsAppClient({ id: { _serialized: "msg-3" }, ack: 0 });
    const submission = submitWhatsAppMessageWithServerAck(client, {
      target: "owner@c.us",
      body: "sanitized test body",
      ackTimeoutMs: 5,
    });

    await expect(submission).rejects.toMatchObject<Partial<WhatsAppOutboundSubmissionError>>({
      code: "ack_timeout",
    });
  });
});
