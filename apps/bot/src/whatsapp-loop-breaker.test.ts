import { describe, expect, it, vi } from "vitest";
import type { InboundMessage, OutboundMessage, WhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { WhatsAppLoopBreaker } from "./whatsapp-loop-breaker.js";

class FakeWhatsApp implements WhatsAppClient {
  handlers: Array<(msg: InboundMessage) => Promise<void> | void> = [];
  sent: OutboundMessage[] = [];

  async ready() {}
  async send(msg: OutboundMessage) {
    this.sent.push(msg);
    return { id: `sent-${this.sent.length}` };
  }
  onMessage(handler: (msg: InboundMessage) => Promise<void> | void) {
    this.handlers.push(handler);
  }
  async destroy() {}
  emit(body: string) {
    const msg: InboundMessage = {
      id: `in-${Date.now()}-${body}`,
      from: "+61430008008",
      body,
      timestamp: new Date(),
      hasMedia: false,
    };
    for (const handler of this.handlers) void handler(msg);
  }
}

describe("WhatsAppLoopBreaker", () => {
  it("pauses and drops inbound that matches recent bot output", async () => {
    const inner = new FakeWhatsApp();
    const onTrip = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, { onTrip });
    const handler = vi.fn();
    breaker.onMessage(handler);

    await breaker.send({ to: "+61430008008", body: "Ready when you are" });
    inner.emit("Ready when you are");
    inner.emit("next real message");

    expect(onTrip).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
    expect(breaker.isPaused()).toBe(true);
  });

  it("stays paused until manual reset", async () => {
    let now = 1_000;
    const inner = new FakeWhatsApp();
    const breaker = new WhatsAppLoopBreaker(inner, { now: () => now });
    breaker.onMessage(vi.fn());

    await breaker.send({ to: "+61430008008", body: "loop" });
    inner.emit("loop");
    now += 60 * 60 * 1000;

    await expect(
      breaker.send({ to: "+61430008008", body: "still blocked" }),
    ).rejects.toThrow("loop breaker");
  });

  it("pauses before sending when outbound rate spikes", async () => {
    const inner = new FakeWhatsApp();
    const breaker = new WhatsAppLoopBreaker(inner, {
      maxSendsPerWindow: 2,
      sendWindowMs: 60_000,
    });

    await breaker.send({ to: "+61430008008", body: "one" });
    await breaker.send({ to: "+61430008008", body: "two" });
    await expect(
      breaker.send({ to: "+61430008008", body: "three" }),
    ).rejects.toThrow("loop breaker");
    expect(inner.sent.map((msg) => msg.body)).toEqual(["one", "two"]);
  });

  it("resume command clears pause but is consumed before router", async () => {
    const inner = new FakeWhatsApp();
    const onReset = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, { onReset });
    const handler = vi.fn();
    breaker.onMessage(handler);

    await breaker.send({ to: "+61430008008", body: "echo" });
    inner.emit("echo");
    inner.emit("resume bot");
    inner.emit("fresh request");

    expect(breaker.isPaused()).toBe(false);
    expect(onReset).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].body).toBe("fresh request");
  });

  it("reports diagnostic incident data when tripped", async () => {
    const inner = new FakeWhatsApp();
    const onTrip = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, { onTrip });
    breaker.onMessage(vi.fn());

    await breaker.send({ to: "+61430008008", body: "diagnostic body" });
    inner.emit("diagnostic body");

    expect(onTrip).toHaveBeenCalledWith(expect.objectContaining({
      reason: "inbound matched recent outbound",
      sendCount: 1,
      recentOutboundPreviews: ["diagnostic body"],
    }));
  });
});
