import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, resetEnvCache } from "../src/env.js";

describe("loadEnv", () => {
  beforeEach(() => resetEnvCache());

  it("loads with required overrides", () => {
    const env = loadEnv({
      ANTHROPIC_API_KEY: "k",
      DATABASE_URL: "postgres://x",
      WHATSAPP_OWNER_NUMBER: "+91",
    });
    expect(env.TIMEZONE).toBe("Australia/Melbourne");
    expect(env.HOME_CITY).toBe("Melbourne");
    expect(env.HOME_REGION).toBe("Victoria");
    expect(env.HOME_COUNTRY).toBe("Australia");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-4-6");
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
      ENABLE_HEARTBEAT: "false",
    });
    expect(env.ENABLE_HEARTBEAT).toBe(false);
  });
});
