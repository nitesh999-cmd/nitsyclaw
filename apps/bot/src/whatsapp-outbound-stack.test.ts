import { describe, expect, test, vi } from "vitest";
import type { InboundMessage, OutboundMessage, WhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { WhatsAppLoopBreaker } from "./whatsapp-loop-breaker";
import { WhatsAppSendMonitor } from "./whatsapp-send-monitor";

vi.mock("@nitsyclaw/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nitsyclaw/shared/db")>()),
  upsertSystemHeartbeat: vi.fn(async () => ({
    source: "whatsapp-send",
    status: "ok",
    lastSeenAt: new Date("2026-05-15T00:00:00.000Z"),
    metadata: {},
    updatedAt: new Date("2026-05-15T00:00:00.000Z"),
  })),
}));

class RecordingWhatsAppClient implements WhatsAppClient {
  readonly sent: OutboundMessage[] = [];

  ready(): Promise<void> {
    return Promise.resolve();
  }

  async send(msg: OutboundMessage): Promise<{ id: string }> {
    this.sent.push(msg);
    return { id: `sent-${this.sent.length}` };
  }

  onMessage(_handler: (msg: InboundMessage) => Promise<void> | void): void {}

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

describe("WhatsApp outbound stack", () => {
  test("suppresses noisy progress receipt before any raw WhatsApp send", async () => {
    const raw = new RecordingWhatsAppClient();
    const loopBreaker = new WhatsAppLoopBreaker(raw, {
      now: () => new Date("2026-05-15T00:00:00.000Z").getTime(),
    });
    const monitor = new WhatsAppSendMonitor(loopBreaker, {
      db: {} as never,
      now: () => new Date("2026-05-15T00:00:00.000Z"),
    });

    const result = await monitor.send({
      to: "+61430008008",
      body: "Saved. Working on it.",
    });

    expect(result.id).toBe("suppressed-noisy-receipt");
    expect(raw.sent).toEqual([]);
  });

  test("keeps real answer text while stripping the noisy receipt line", async () => {
    const raw = new RecordingWhatsAppClient();
    const loopBreaker = new WhatsAppLoopBreaker(raw, {
      now: () => new Date("2026-05-15T00:00:00.000Z").getTime(),
    });
    const monitor = new WhatsAppSendMonitor(loopBreaker, {
      db: {} as never,
      now: () => new Date("2026-05-15T00:00:00.000Z"),
    });

    await monitor.send({
      to: "+61430008008",
      body: "Saved. Working on it.\nHey Nitesh. What can I do for you today?",
    });

    expect(raw.sent).toEqual([{
      to: "+61430008008",
      body: "Hey Nitesh. What can I do for you today?",
    }]);
  });
});
