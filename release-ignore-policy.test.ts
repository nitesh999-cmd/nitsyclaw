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

  test("release preflight fails if local secret files are staged or left in the repo", () => {
    const source = readFileSync("scripts/preflight.ps1", "utf8");

    expect(source).toContain("Secret/local-file checks");
    expect(source).toContain("git diff --cached --name-only");
    expect(source).toContain("Unsafe staged file for release");
    expect(source).toContain("Local secrets/session files exist inside the repo");
    expect(source).toContain("NITSYCLAW_SECRET_ROOT");
    expect(source).toContain("^\\.claude/settings\\.local\\.json$");
    expect(source).toContain("google-credentials\\.json");
    expect(source).toContain("google-token.*\\.json");
    expect(source).toContain("ms-token\\.json");
    expect(source).toContain(".env.local.example");
    expect(source).toContain("\\.sqlite$");
    expect(source).toContain("\\.db$");
    expect(source).toContain("\\.env\\.local$");
  });
});
