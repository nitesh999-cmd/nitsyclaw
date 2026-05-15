import { describe, expect, it } from "vitest";
import {
  formatNonSelfChatDropNotice,
  prepareOutboundBodyForWhatsApp,
  shouldSendNonSelfChatDropNotice,
} from "./wwebjs-client.js";

describe("prepareOutboundBodyForWhatsApp", () => {
  it.each([
    "Saved. Working on it.",
    "Saved.Working on it.",
    "Working on it.",
    " working on it ",
  ])("suppresses noisy receipt before raw WhatsApp send: %s", (body) => {
    expect(prepareOutboundBodyForWhatsApp(body)).toBe("");
  });

  it("removes noisy receipt lines but keeps the real answer", () => {
    expect(
      prepareOutboundBodyForWhatsApp("Saved. Working on it.\nHey Nitesh! What can I do for you today?"),
    ).toBe("Hey Nitesh! What can I do for you today?");
  });
});

describe("non-self chat drop diagnostics", () => {
  it("notifies only for owner-authored command-like messages outside self-chat", () => {
    expect(shouldSendNonSelfChatDropNotice({
      body: "remind me to call Mukesh tomorrow",
      fromMe: true,
      nowMs: 10_000,
      lastNoticeAtMs: 0,
    })).toBe(true);
    expect(shouldSendNonSelfChatDropNotice({
      body: "see you soon",
      fromMe: true,
      nowMs: 10_000,
      lastNoticeAtMs: 0,
    })).toBe(false);
    expect(shouldSendNonSelfChatDropNotice({
      body: "what can you do?",
      fromMe: false,
      nowMs: 10_000,
      lastNoticeAtMs: 0,
    })).toBe(false);
  });

  it("rate-limits outside-chat diagnostic notices", () => {
    expect(shouldSendNonSelfChatDropNotice({
      body: "weather tomorrow",
      fromMe: true,
      nowMs: 30_000,
      lastNoticeAtMs: 20_000,
    })).toBe(false);
    expect(shouldSendNonSelfChatDropNotice({
      body: "weather tomorrow",
      fromMe: true,
      nowMs: 11 * 60_000,
      lastNoticeAtMs: 0,
    })).toBe(true);
  });

  it("explains the ignored command without leaking message content", () => {
    const notice = formatNonSelfChatDropNotice();
    expect(notice).toContain("outside your Message Yourself chat");
    expect(notice).toContain("I did not reply in that other chat");
    expect(notice).not.toContain("Mukesh");
  });
});
