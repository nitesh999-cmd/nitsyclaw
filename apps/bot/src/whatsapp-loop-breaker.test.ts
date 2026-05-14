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

  it("allows the normal phone proof flow without tripping the default send-burst guard", async () => {
    const inner = new FakeWhatsApp();
    const onTrip = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, { onTrip });

    for (const body of [
      "Working on it.",
      "Hi. What can I do for you?",
      "Last voice transcript I have:\nhello",
      "Feature queue status sent.",
      "Working on it.",
      "Transcribed. I will reply in English.\nWhat's the weather tomorrow?",
      "Melbourne tomorrow: cool and cloudy.",
    ]) {
      await breaker.send({ to: "+61430008008", body });
    }

    expect(onTrip).not.toHaveBeenCalled();
    expect(breaker.isPaused()).toBe(false);
    expect(inner.sent).toHaveLength(7);
  });

  it("still pauses an abnormal default send burst", async () => {
    const inner = new FakeWhatsApp();
    const onTrip = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, { onTrip });

    for (let index = 1; index <= 12; index += 1) {
      await breaker.send({ to: "+61430008008", body: `message ${index}` });
    }

    await expect(
      breaker.send({ to: "+61430008008", body: "message 13" }),
    ).rejects.toThrow("loop breaker");
    expect(onTrip).toHaveBeenCalledWith(expect.objectContaining({
      reason: "send burst: 13 sends in 90000ms",
    }));
  });

  it("auto-resets send burst cooldown instead of staying permanently paused", async () => {
    let now = 1_000;
    const inner = new FakeWhatsApp();
    const onReset = vi.fn();
    const handler = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, {
      now: () => now,
      maxSendsPerWindow: 2,
      sendWindowMs: 60_000,
      sendBurstCooldownMs: 90_000,
      onReset,
    });
    breaker.onMessage(handler);

    await breaker.send({ to: "+61430008008", body: "one" });
    await breaker.send({ to: "+61430008008", body: "two" });
    await expect(
      breaker.send({ to: "+61430008008", body: "three" }),
    ).rejects.toThrow("loop breaker");
    expect(breaker.isPaused()).toBe(true);

    now += 91_000;
    inner.emit("fresh after cooldown");

    expect(breaker.isPaused()).toBe(false);
    expect(onReset).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].body).toBe("fresh after cooldown");
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
    expect(inner.sent.some((msg) => msg.body.includes("WhatsApp replies resumed"))).toBe(true);
  });

  it("accepts plain WhatsApp recovery phrases while paused", async () => {
    const inner = new FakeWhatsApp();
    const onReset = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, { onReset });
    const handler = vi.fn();
    breaker.onMessage(handler);

    await breaker.send({ to: "+61430008008", body: "echo" });
    inner.emit("echo");
    inner.emit("resume whatsapp");
    inner.emit("fresh request");

    expect(breaker.isPaused()).toBe(false);
    expect(onReset).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    expect(inner.sent.some((msg) => msg.body.includes("WhatsApp replies resumed"))).toBe(true);
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
      recentOutboundPreviews: ["[message 15 chars]"],
    }));
  });

  it("reports auto-reset time for send burst incidents", async () => {
    let now = Date.UTC(2026, 4, 9, 0, 0, 0);
    const inner = new FakeWhatsApp();
    const onTrip = vi.fn();
    const breaker = new WhatsAppLoopBreaker(inner, {
      now: () => now,
      maxSendsPerWindow: 1,
      sendWindowMs: 60_000,
      sendBurstCooldownMs: 120_000,
      onTrip,
    });

    await breaker.send({ to: "+61430008008", body: "one" });
    await expect(
      breaker.send({ to: "+61430008008", body: "two" }),
    ).rejects.toThrow("loop breaker");

    expect(onTrip).toHaveBeenCalledWith(expect.objectContaining({
      reason: "send burst: 2 sends in 60000ms",
      resetAt: "2026-05-09T00:02:00.000Z",
    }));
  });

  it("exposes a safe diagnostic status for bot health checks", async () => {
    let now = Date.UTC(2026, 4, 9, 0, 0, 0);
    const inner = new FakeWhatsApp();
    const breaker = new WhatsAppLoopBreaker(inner, {
      now: () => now,
      maxSendsPerWindow: 1,
      sendWindowMs: 60_000,
      sendBurstCooldownMs: 120_000,
    });

    await breaker.send({ to: "+61430008008", body: "one" });
    await expect(
      breaker.send({ to: "+61430008008", body: "two" }),
    ).rejects.toThrow("loop breaker");

    expect(breaker.status()).toEqual({
      paused: true,
      reason: "send burst: 2 sends in 60000ms",
      resetAt: "2026-05-09T00:02:00.000Z",
      recentSendCount: 2,
      recentOutboundCount: 1,
    });

    now += 121_000;
    expect(breaker.status()).toEqual({
      paused: false,
      recentSendCount: 0,
      recentOutboundCount: 0,
    });
  });
});
