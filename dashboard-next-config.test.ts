import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SERVER_ONLY_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ENCRYPTION_KEY",
  "WHATSAPP_OWNER_NUMBER",
  "MS_TOKEN_JSON",
  "GOOGLE_CREDENTIALS_JSON",
  "GOOGLE_TOKEN_JSON",
  "GOOGLE_TOKEN_SOLARHARBOUR_JSON",
] as const;

describe("dashboard Next config", () => {
  const source = readFileSync("apps/dashboard/next.config.js", "utf8");

  it("does not inline server-only secrets through next.config env", () => {
    expect(source).not.toMatch(/^\s*env\s*:/m);

    for (const key of SERVER_ONLY_ENV_KEYS) {
      expect(source).not.toContain(key);
    }
  });
});
