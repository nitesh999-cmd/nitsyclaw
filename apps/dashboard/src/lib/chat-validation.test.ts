import { describe, expect, it } from "vitest";
import {
  CHAT_MAX_BODY_BYTES,
  CHAT_MAX_HISTORY_ITEMS,
  CHAT_MAX_MESSAGE_CHARS,
  validateChatBody,
  validateContentLength,
  parseLimitedJsonBody,
} from "./chat-validation.js";

describe("chat validation", () => {
  it("rejects oversized content-length before JSON parsing", () => {
    expect(validateContentLength(String(CHAT_MAX_BODY_BYTES + 1))).toEqual({
      ok: false,
      status: 413,
      reply: "Message is too large",
    });
  });

  it("rejects malformed history payloads", () => {
    expect(validateChatBody({ history: [] })).toMatchObject({ ok: false, status: 400 });
    expect(validateChatBody({ history: [{ role: "user", content: "" }] })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(validateChatBody({ history: [{ role: "system", content: "x" }] })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("rejects too many messages and too-long content", () => {
    expect(validateChatBody({ history: Array.from({ length: CHAT_MAX_HISTORY_ITEMS + 1 }, () => ({ role: "user", content: "x" })) })).toMatchObject({ ok: false, status: 400 });
    expect(validateChatBody({ history: [{ role: "user", content: "x".repeat(CHAT_MAX_MESSAGE_CHARS + 1) }] })).toMatchObject({ ok: false, status: 413 });
  });

  it("returns the last user message for a valid request", () => {
    expect(validateChatBody({ history: [{ role: "user", content: "hello" }] })).toMatchObject({
      ok: true,
      last: { role: "user", content: "hello" },
    });
  });

  it("rejects oversized JSON bodies even when content-length is absent", async () => {
    const request = new Request("https://nitsyclaw.vercel.app/api/chat", {
      method: "POST",
      body: JSON.stringify({
        history: [{ role: "user", content: "x".repeat(CHAT_MAX_BODY_BYTES) }],
      }),
    });

    await expect(parseLimitedJsonBody(request)).resolves.toEqual({
      ok: false,
      status: 413,
      reply: "Message is too large",
    });
  });

  it("returns bad request for malformed JSON", async () => {
    const request = new Request("https://nitsyclaw.vercel.app/api/chat", {
      method: "POST",
      body: "{bad json",
    });

    await expect(parseLimitedJsonBody(request)).resolves.toEqual({
      ok: false,
      status: 400,
      reply: "Bad request",
    });
  });
});
