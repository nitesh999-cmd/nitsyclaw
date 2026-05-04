import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const secretPatterns = [
  ".env",
  ".env.*",
  "google-credentials.json",
  "google-token*.json",
  "ms-token.json",
  "**/.wa-session",
] as const;

describe("release ignore policy", () => {
  test("Vercel and Docker deploy contexts exclude local secrets and WhatsApp sessions", () => {
    for (const file of [".vercelignore", ".dockerignore"]) {
      const source = readFileSync(file, "utf8");
      for (const pattern of secretPatterns) {
        expect(source, `${file} should ignore ${pattern}`).toContain(pattern);
      }
    }
  });
});
