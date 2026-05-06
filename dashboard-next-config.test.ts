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

  it("uses Next 16 route typegen output without committing dev next-env state", () => {
    const tsconfig = readFileSync("apps/dashboard/tsconfig.json", "utf8");
    const nextEnvFix = readFileSync("scripts/next-typegen-dev.mjs", "utf8");
    const dashboardPackage = readFileSync("apps/dashboard/package.json", "utf8");

    expect(tsconfig).toContain(".next/dev/types/**/*.ts");
    expect(tsconfig).toContain('"incremental": false');
    expect(dashboardPackage).toContain("next-typegen-dev.mjs");
    expect(dashboardPackage).not.toContain("tsc --noEmit");
    expect(nextEnvFix).toContain("./.next/dev/types/routes.d.ts");
    expect(nextEnvFix).toContain("./.next/types/routes.d.ts");
    expect(nextEnvFix).toContain("finally");
  });
});
