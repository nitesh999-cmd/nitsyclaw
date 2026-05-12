import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboundMessage, OutboundMessage, WhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { pushNotify } from "@nitsyclaw/shared/notify";
import { upsertSystemHeartbeat } from "@nitsyclaw/shared/db";
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
          error: expect.stringContaining("[redacted:email]"),
        }),
      }),
    );
    expect(pushNotify).toHaveBeenCalledWith(
      expect.stringContaining("[redacted:email]"),
      expect.objectContaining({
        title: "NitsyClaw WhatsApp send failed",
        priority: "urgent",
      }),
    );
    expect(JSON.stringify(vi.mocked(upsertSystemHeartbeat).mock.calls)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(vi.mocked(pushNotify).mock.calls)).not.toContain("sk_live");
  });
});
