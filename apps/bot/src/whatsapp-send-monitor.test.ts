import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboundMessage, OutboundMessage, WhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { pushNotify } from "@nitsyclaw/shared/notify";
import {
  claimSystemNotification,
  getSystemHeartbeat,
  upsertSystemHeartbeat,
} from "@nitsyclaw/shared/db";
import { WhatsAppSendMonitor } from "./whatsapp-send-monitor.js";

vi.mock("@nitsyclaw/shared/notify", () => ({
  pushNotify: vi.fn(async () => {}),
}));

vi.mock("@nitsyclaw/shared/db", () => ({
  redactAuditString: (value: string) => value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted:email]")
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, "[redacted:phone]")
    .replace(/\b(?:(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{8,}|(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g, "[redacted:token]"),
  sanitizeAuditPayload: (value: unknown) => value,
  claimSystemNotification: vi.fn(async () => true),
  getSystemHeartbeat: vi.fn(async () => null),
  upsertSystemHeartbeat: vi.fn(async () => {}),
}));

class FakeWhatsApp implements WhatsAppClient {
  readonly handlers: Array<(msg: InboundMessage) => Promise<void> | void> = [];
  sent: OutboundMessage[] = [];
  failure: Error | null = null;

  async ready() {}

  async send(msg: OutboundMessage) {
    if (this.failure) throw this.failure;
    this.sent.push(msg);
    return { id: "sent-1" };
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void> | void) {
    this.handlers.push(handler);
  }

  async destroy() {}
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("WhatsAppSendMonitor", () => {
  it("passes successful sends through and clears stale failure telemetry", async () => {
    const inner = new FakeWhatsApp();
    const monitor = new WhatsAppSendMonitor(inner, {
      db: {} as never,
      now: () => new Date("2026-05-07T01:02:03.000Z"),
    });

    await expect(monitor.send({ to: "+61430008008", body: "hello" })).resolves.toEqual({ id: "sent-1" });

    expect(inner.sent).toEqual([{ to: "+61430008008", body: "hello" }]);
    expect(upsertSystemHeartbeat).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        source: "whatsapp-send",
        status: "ok",
        metadata: {
          at: "2026-05-07T01:02:03.000Z",
          lastMessageId: "sent-1",
        },
      }),
    );
    expect(pushNotify).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(upsertSystemHeartbeat).mock.calls)).not.toContain("+61430008008");
    expect(JSON.stringify(vi.mocked(upsertSystemHeartbeat).mock.calls)).not.toContain("hello");
  });

  it("records redacted failure telemetry and rethrows the send error", async () => {
    const inner = new FakeWhatsApp();
    inner.failure = new Error("failed for nitesh@example.com +61 430 008 008 sk_live_secret123456789");
    const monitor = new WhatsAppSendMonitor(inner, {
      db: {} as never,
      now: () => new Date("2026-05-07T01:02:03.000Z"),
    });

    await expect(monitor.send({ to: "+61430008008", body: "hello" })).rejects.toThrow("failed for");

    expect(upsertSystemHeartbeat).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        source: "whatsapp-send",
        status: "error",
        metadata: expect.objectContaining({
          at: "2026-05-07T01:02:03.000Z",
          error: "send_failed",
        }),
      }),
    );
    expect(pushNotify).toHaveBeenCalledWith(
      "WhatsApp outbound delivery failed. Check WhatsApp health before retrying.",
      expect.objectContaining({
        title: "NitsyClaw WhatsApp send failed",
        priority: "urgent",
      }),
    );
    expect(JSON.stringify(vi.mocked(upsertSystemHeartbeat).mock.calls)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(vi.mocked(claimSystemNotification).mock.calls)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(vi.mocked(pushNotify).mock.calls)).not.toContain("sk_live");
  });

  it("rate-limits repeated urgent send-failure pushes while still recording heartbeats", async () => {
    vi.mocked(claimSystemNotification)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const inner = new FakeWhatsApp();
    inner.failure = new Error("Protocol error (Runtime.callFunctionOn): Target closed");
    let nowMs = new Date("2026-05-07T01:02:03.000Z").getTime();
    const monitor = new WhatsAppSendMonitor(inner, {
      db: {} as never,
      now: () => new Date(nowMs),
      failureNotifyCooldownMs: 60_000,
    });

    await expect(monitor.send({ to: "+61430008008", body: "hello" })).rejects.toThrow("Target closed");
    nowMs += 10_000;
    await expect(monitor.send({ to: "+61430008008", body: "hello again" })).rejects.toThrow("Target closed");
    nowMs += 61_000;
    await expect(monitor.send({ to: "+61430008008", body: "hello third" })).rejects.toThrow("Target closed");

    expect(pushNotify).toHaveBeenCalledTimes(2);
    expect(upsertSystemHeartbeat).toHaveBeenCalledTimes(3);
  });

  it("keeps failure dedupe across monitor restarts through the persistent claim", async () => {
    vi.mocked(claimSystemNotification)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const firstInner = new FakeWhatsApp();
    firstInner.failure = new Error("Target closed");
    const secondInner = new FakeWhatsApp();
    secondInner.failure = new Error("Target closed");

    await expect(new WhatsAppSendMonitor(firstInner, { db: {} as never }).send({
      to: "+61430008008",
      body: "one",
    })).rejects.toThrow("Target closed");
    await expect(new WhatsAppSendMonitor(secondInner, { db: {} as never }).send({
      to: "+61430008008",
      body: "two",
    })).rejects.toThrow("Target closed");

    expect(pushNotify).toHaveBeenCalledTimes(1);
  });

  it("sends one recovery notification on the error-to-ok state change", async () => {
    vi.mocked(getSystemHeartbeat).mockResolvedValueOnce({
      id: "heartbeat-1",
      source: "whatsapp-send",
      status: "error",
      lastSeenAt: new Date("2026-05-07T01:00:00.000Z"),
      metadata: { error: "browser_closed" },
      updatedAt: new Date("2026-05-07T01:00:00.000Z"),
    });
    const monitor = new WhatsAppSendMonitor(new FakeWhatsApp(), {
      db: {} as never,
      now: () => new Date("2026-05-07T01:02:03.000Z"),
    });

    await monitor.send({ to: "+61430008008", body: "health proof" });

    expect(claimSystemNotification).toHaveBeenCalledWith({}, expect.objectContaining({
      source: "whatsapp-send-alert:recovery",
      fingerprint: "recovery:browser_closed",
    }));
    expect(pushNotify).toHaveBeenCalledWith(
      "WhatsApp outbound delivery recovered after a recorded failure.",
      expect.objectContaining({ title: "NitsyClaw WhatsApp recovered" }),
    );
  });

  it("suppresses noisy saved/working receipts before they reach WhatsApp", async () => {
    const inner = new FakeWhatsApp();
    const monitor = new WhatsAppSendMonitor(inner, {
      db: {} as never,
      now: () => new Date("2026-05-07T01:02:03.000Z"),
    });

    await expect(monitor.send({ to: "+61430008008", body: "Saved. Working on it." })).resolves.toEqual({
      id: "suppressed-noisy-receipt",
    });

    expect(inner.sent).toHaveLength(0);
    expect(upsertSystemHeartbeat).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        source: "whatsapp-send-suppressed",
        status: "ok",
        metadata: {
          at: "2026-05-07T01:02:03.000Z",
          suppressed: "noisy_receipt",
        },
      }),
    );
  });

  it("strips noisy receipt lines before forwarding real answers", async () => {
    const inner = new FakeWhatsApp();
    const monitor = new WhatsAppSendMonitor(inner, {
      db: {} as never,
      now: () => new Date("2026-05-07T01:02:03.000Z"),
    });

    await expect(
      monitor.send({
        to: "+61430008008",
        body: "Saved. Working on it.\nHey Nitesh! What can I do for you today?",
      }),
    ).resolves.toEqual({ id: "sent-1" });

    expect(inner.sent).toEqual([
      {
        to: "+61430008008",
        body: "Hey Nitesh! What can I do for you today?",
      },
    ]);
  });
});
