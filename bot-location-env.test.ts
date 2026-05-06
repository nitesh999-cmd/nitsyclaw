import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("bot location env wiring", () => {
  test("passes home and current location env into WhatsApp agent deps", () => {
    const source = readFileSync("apps/bot/src/index.ts", "utf8");

    for (const key of [
      "HOME_CITY",
      "HOME_REGION",
      "HOME_COUNTRY",
      "CURRENT_CITY",
      "CURRENT_REGION",
      "CURRENT_COUNTRY",
      "SERPER_API_KEY",
      "ENABLE_WEB_RESEARCH",
    ]) {
      expect(source).toContain(`${key}: env.${key}`);
    }
    expect(source).toContain("presenceUnavailableIntervalMs: env.NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS");
  });
});
