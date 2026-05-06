import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, resetEnvCache } from "../src/env.js";

describe("loadEnv", () => {
  beforeEach(() => resetEnvCache());

  const ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");

  it("loads with required overrides", () => {
    const env = loadEnv({
      ANTHROPIC_API_KEY: "k",
      DATABASE_URL: "postgres://x",
      WHATSAPP_OWNER_NUMBER: "+91",
      ENCRYPTION_KEY,
    });
    expect(env.TIMEZONE).toBe("Australia/Melbourne");
    expect(env.HOME_CITY).toBe("Melbourne");
    expect(env.HOME_REGION).toBe("Victoria");
    expect(env.HOME_COUNTRY).toBe("Australia");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-4-6");
    expect(env.SERPER_API_KEY).toBeUndefined();
    expect(env.ENCRYPTION_KEY).toBe(ENCRYPTION_KEY);
    expect(env.NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS).toBe(60_000);
  });

  it("throws on missing required", () => {
    // Build a minimal env that strips required keys
    const orig = { ...process.env };
    try {
      process.env = {} as NodeJS.ProcessEnv;
      expect(() => loadEnv()).toThrow(/Invalid env/);
    } finally {
      process.env = orig;
    }
  });

  it("coerces booleans", () => {
    const env = loadEnv({
      ANTHROPIC_API_KEY: "k",
      DATABASE_URL: "x",
      WHATSAPP_OWNER_NUMBER: "+91",
      ENCRYPTION_KEY,
      ENABLE_HEARTBEAT: "false",
    });
    expect(env.ENABLE_HEARTBEAT).toBe(false);
  });

  it("validates WhatsApp presence interval", () => {
    const env = loadEnv({
      ANTHROPIC_API_KEY: "k",
      DATABASE_URL: "x",
      WHATSAPP_OWNER_NUMBER: "+91",
      ENCRYPTION_KEY,
      NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS: "15000",
    });
    expect(env.NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS).toBe(15_000);

    expect(() => loadEnv({
      ANTHROPIC_API_KEY: "k",
      DATABASE_URL: "x",
      WHATSAPP_OWNER_NUMBER: "+91",
      ENCRYPTION_KEY,
      NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS: "-1",
    })).toThrow(/NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS/);
  });

  it("rejects malformed encryption keys", () => {
    expect(() => loadEnv({
      ANTHROPIC_API_KEY: "k",
      DATABASE_URL: "x",
      WHATSAPP_OWNER_NUMBER: "+91",
      ENCRYPTION_KEY: "not-a-32-byte-key",
    })).toThrow(/ENCRYPTION_KEY/);
  });
});
