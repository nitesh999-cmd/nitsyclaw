import { describe, expect, it } from "vitest";
import { WhatsAppEchoGuard, isStartupReplay } from "./whatsapp-echo-guard.js";

describe("WhatsAppEchoGuard", () => {
  it("does not consume outgoing echo matches", () => {
    let now = 1_000;
    const guard = new WhatsAppEchoGuard(() => now);

    guard.rememberOutgoing("Ready when you are");

    expect(guard.isOutgoingEcho("Ready when you are")).toBe(true);
    expect(guard.isOutgoingEcho("Ready when you are")).toBe(true);
  });

  it("expires old outgoing echo matches", () => {
    let now = 1_000;
    const guard = new WhatsAppEchoGuard(() => now, 100);

    guard.rememberOutgoing("old reply");
    now = 1_200;

    expect(guard.isOutgoingEcho("old reply")).toBe(false);
  });

  it("deduplicates repeated message events by id", () => {
    const guard = new WhatsAppEchoGuard();

    expect(guard.firstSeenMessage("msg-1")).toBe(true);
    expect(guard.firstSeenMessage("msg-1")).toBe(false);
    expect(guard.firstSeenMessage("msg-2")).toBe(true);
  });

  it("detects old fromMe startup replay messages", () => {
    expect(isStartupReplay(10, true, 20_000)).toBe(true);
    expect(isStartupReplay(18, true, 20_000)).toBe(false);
    expect(isStartupReplay(10, false, 20_000)).toBe(false);
  });
});
