import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SELF_CHAT_CALIBRATION_PHRASE,
  allowSelfChatId,
  isSelfChatCalibrationPhrase,
  readAllowedSelfChatIds,
} from "./whatsapp-self-chat-calibration.js";
import {
  createWhatsAppCorrelationId,
  formatWhatsAppHandlerFailure,
  formatNonSelfChatDropNotice,
  isMissingSendAckError,
  prepareOutboundBodyForWhatsApp,
  pruneChromiumCacheDirs,
  resolveWebVersionCache,
  shouldLogChatLookupError,
  shouldRetryChatLookupForSelfChatCandidate,
  shouldSendNonSelfChatDropNotice,
} from "./wwebjs-client.js";

describe("WhatsApp handler failures", () => {
  it("returns an actionable timeout without leaking the raw error", () => {
    const error = Object.assign(
      new Error("Ollama request timed out for nitesh@example.com sk_live_secret123456789"),
      { name: "OllamaProviderError", code: "timeout" },
    );
    const reply = formatWhatsAppHandlerFailure(error, "aabbccdd");

    expect(reply).toContain("local model timed out");
    expect(reply).toContain("Nothing was sent to a cloud model");
    expect(reply).toContain("did not retry automatically");
    expect(reply).toContain("Ref: NC-AABBCCDD");
    expect(reply).not.toContain("nitesh@example.com");
    expect(reply).not.toContain("sk_live");
  });

  it.each([
    [Object.assign(new Error("ECONNREFUSED"), { name: "OllamaProviderError", code: "offline" }), "local model is unavailable"],
    [Object.assign(new Error("blank"), { code: "empty_response" }), "no usable answer"],
    [new Error("401 invalid api key secret-value"), "rejected authentication"],
    [Object.assign(new Error("tool exploded with private-value"), { code: "tool_failure" }), "backend tool step failed"],
    [new Error("database query timed out with private-value"), "backend step timed out"],
    [new Error("backend exploded with private-value"), "backend error"],
  ])("classifies failures without returning internals", (error, expected) => {
    const reply = formatWhatsAppHandlerFailure(error, "11223344");
    expect(reply).toContain(expected);
    expect(reply).toContain("Ref: NC-11223344");
    expect(reply).not.toContain("secret-value");
    expect(reply).not.toContain("private-value");
  });

  it("creates a compact sanitized correlation id", () => {
    expect(createWhatsAppCorrelationId(() => "aa-bb_cc!!dd")).toBe("NC-AABBCCDD");
  });
});

describe("resolveWebVersionCache", () => {
  it("does not hard-pin a stale WhatsApp Web version by default", () => {
    const previous = process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH;
    delete process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH;
    try {
      expect(resolveWebVersionCache()).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH;
      } else {
        process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH = previous;
      }
    }
  });

  it("allows an operator-provided remote WhatsApp Web version cache", () => {
    const previous = process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH;
    process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH = "https://example.com/wa.html";
    try {
      expect(resolveWebVersionCache()).toEqual({
        type: "remote",
        remotePath: "https://example.com/wa.html",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH;
      } else {
        process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH = previous;
      }
    }
  });
});

describe("isMissingSendAckError", () => {
  it("recognizes the whatsapp-web.js missing send acknowledgement crash", () => {
    expect(
      isMissingSendAckError(new TypeError("Cannot read properties of undefined (reading 'id')")),
    ).toBe(true);
  });

  it("does not hide real browser target closure errors", () => {
    const error = new Error("Protocol error (Runtime.callFunctionOn): Target closed");
    error.name = "TargetCloseError";
    expect(isMissingSendAckError(error)).toBe(false);
  });
});

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

  it("removes noisy transcription notices but keeps the real answer", () => {
    expect(
      prepareOutboundBodyForWhatsApp("Transcribed. I will reply in English.\nThe weather tomorrow is mild."),
    ).toBe("The weather tomorrow is mild.");
  });
});

describe("non-self chat drop diagnostics", () => {
  it("retries chat lookup only for owner-authored LID self-chat candidates", () => {
    expect(shouldRetryChatLookupForSelfChatCandidate({
      from: "61430008008@c.us",
      fromMe: true,
      to: "129274421981381@lid",
      chatId: "",
      ownerNumber: "+61430008008",
    })).toBe(true);
    expect(shouldRetryChatLookupForSelfChatCandidate({
      from: "61430008008@c.us",
      fromMe: true,
      to: "61425046161@c.us",
      chatId: "",
      ownerNumber: "+61430008008",
    })).toBe(false);
    expect(shouldRetryChatLookupForSelfChatCandidate({
      from: "61430008008@c.us",
      fromMe: false,
      to: "129274421981381@lid",
      chatId: "",
      ownerNumber: "+61430008008",
    })).toBe(false);
    expect(shouldRetryChatLookupForSelfChatCandidate({
      from: "61430008008@c.us",
      fromMe: true,
      to: "129274421981381@lid",
      chatId: "61425046161@c.us",
      ownerNumber: "+61430008008",
    })).toBe(false);
  });

  it("does not log expected broadcast or newsletter chat lookup failures", () => {
    expect(shouldLogChatLookupError({
      body: "",
      from: "status@broadcast",
      fromMe: false,
      to: "123@c.us",
    })).toBe(false);
    expect(shouldLogChatLookupError({
      body: "",
      from: "123@newsletter",
      fromMe: false,
      to: "123@c.us",
    })).toBe(false);
  });

  it("keeps chat lookup diagnostics for owner-authored command-like drops", () => {
    expect(shouldLogChatLookupError({
      body: "remind me to call Mukesh tomorrow",
      from: "123@c.us",
      fromMe: true,
      to: "456@lid",
    })).toBe(true);
    expect(shouldLogChatLookupError({
      body: "see you soon",
      from: "123@c.us",
      fromMe: true,
      to: "456@lid",
    })).toBe(false);
  });

  it("does not notify for owner-authored command-like messages outside self-chat by default", () => {
    expect(shouldSendNonSelfChatDropNotice({
      body: "remind me to call Mukesh tomorrow",
      fromMe: true,
      nowMs: 10_000,
      lastNoticeAtMs: 0,
    })).toBe(false);
  });

  it("notifies only for owner-authored command-like messages outside self-chat when explicitly enabled", () => {
    expect(shouldSendNonSelfChatDropNotice({
      body: "remind me to call Mukesh tomorrow",
      fromMe: true,
      nowMs: 10_000,
      lastNoticeAtMs: 0,
      enabled: true,
    })).toBe(true);
    expect(shouldSendNonSelfChatDropNotice({
      body: "see you soon",
      fromMe: true,
      nowMs: 10_000,
      lastNoticeAtMs: 0,
      enabled: true,
    })).toBe(false);
    expect(shouldSendNonSelfChatDropNotice({
      body: "what can you do?",
      fromMe: false,
      nowMs: 10_000,
      lastNoticeAtMs: 0,
      enabled: true,
    })).toBe(false);
  });

  it("rate-limits outside-chat diagnostic notices", () => {
    expect(shouldSendNonSelfChatDropNotice({
      body: "weather tomorrow",
      fromMe: true,
      nowMs: 30_000,
      lastNoticeAtMs: 20_000,
      enabled: true,
    })).toBe(false);
    expect(shouldSendNonSelfChatDropNotice({
      body: "weather tomorrow",
      fromMe: true,
      nowMs: 11 * 60_000,
      lastNoticeAtMs: 0,
      enabled: true,
    })).toBe(true);
  });

  it("explains the ignored command without leaking message content", () => {
    const notice = formatNonSelfChatDropNotice();
    expect(notice).toContain("outside your Message Yourself chat");
    expect(notice).toContain("I did not reply in that other chat");
    expect(notice).not.toContain("Mukesh");
  });
});

describe("self-chat calibration", () => {
  it("requires the exact calibration phrase", () => {
    expect(isSelfChatCalibrationPhrase(SELF_CHAT_CALIBRATION_PHRASE)).toBe(true);
    expect(isSelfChatCalibrationPhrase("hi")).toBe(false);
    expect(isSelfChatCalibrationPhrase("nitsyclaw calibrate other chat")).toBe(false);
  });

  it("stores only LID self-chat ids in the session secret area", async () => {
    const root = mkdtempSync(join(tmpdir(), "nitsyclaw-wa-self-chat-"));
    try {
      await allowSelfChatId(root, "129274421981381@lid");
      await allowSelfChatId(root, "61425046161@c.us");
      expect(await readAllowedSelfChatIds(root)).toEqual(["129274421981381@lid"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("WhatsApp Chromium profile cleanup", () => {
  it("prunes cache folders without deleting auth-critical browser storage", () => {
    const root = mkdtempSync(join(tmpdir(), "nitsyclaw-wa-cache-"));
    try {
      const defaultProfile = join(root, "session", "Default");
      const cache = join(defaultProfile, "Cache");
      const codeCache = join(defaultProfile, "Code Cache");
      const localStorage = join(defaultProfile, "Local Storage");
      const indexedDb = join(defaultProfile, "IndexedDB");
      mkdirSync(cache, { recursive: true });
      mkdirSync(codeCache, { recursive: true });
      mkdirSync(localStorage, { recursive: true });
      mkdirSync(indexedDb, { recursive: true });
      writeFileSync(join(cache, "cache.bin"), "x");
      writeFileSync(join(codeCache, "code.bin"), "x");
      writeFileSync(join(localStorage, "leveldb"), "keep");
      writeFileSync(join(indexedDb, "db"), "keep");

      expect(pruneChromiumCacheDirs(root)).toBe(2);

      expect(existsSync(cache)).toBe(false);
      expect(existsSync(codeCache)).toBe(false);
      expect(existsSync(localStorage)).toBe(true);
      expect(existsSync(indexedDb)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
