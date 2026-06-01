import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("release secrets doctor", () => {
  const source = readFileSync("scripts/release-secrets-doctor.ps1", "utf8");

  test("checks CI secrets without printing secret values", () => {
    expect(source).toContain("gh secret list");
    expect(source).toContain("RAILWAY_TOKEN");
    expect(source).toContain("VERCEL_TOKEN");
    expect(source).toContain("No secret values are printed");
    expect(source).not.toContain("Write-Host $env:");
    expect(source).not.toContain("gh secret set RAILWAY_TOKEN --body");
  });

  test("explains the manual Railway token step", () => {
    expect(source).toContain("Create or copy a scoped Railway project/API token");
    expect(source).toContain("gh secret set RAILWAY_TOKEN --repo");
    expect(source).toContain("Worker/Railway changes cannot run live WhatsApp proof in CI");
  });
});
