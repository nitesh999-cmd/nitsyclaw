import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("privacy command center", () => {
  it("summarises privacy controls without exposing raw tokens or audit payloads", () => {
    const source = readFileSync("apps/dashboard/src/app/privacy-center/page.tsx", "utf8");

    expect(source).toContain("Privacy command center");
    expect(source).toContain("DEFAULT_PRIVACY_CENTER_TIMEOUT_MS");
    expect(source).toContain("loadPrivacyCenterWithTimeout");
    expect(source).toContain("Promise.race");
    expect(source).toContain("Export my data");
    expect(source).toContain("Delete controls");
    expect(source).toContain("createDataInventoryMap");
    expect(source).toContain("Data inventory map");
    expect(source).toContain("Source:");
    expect(source).toContain("Retention:");
    expect(source).toContain("Control:");
    expect(source).toContain("Trust note:");
    expect(source).toContain("Encrypted");
    expect(source).toContain("Not encrypted");
    expect(source).toContain("Sensitive memory visibility");
    expect(source).toContain("Connected accounts");
    expect(source).toContain("Audit review");
    expect(source).toContain("Tokens are never shown");
    expect(source).toContain("Payloads redacted");
    expect(source).toContain("Shows keys and sensitivity only");
    expect(source).toContain("safeScopeSummary");
    expect(source).not.toContain("accessToken:");
    expect(source).not.toContain("refreshToken:");
    expect(source).not.toContain("input:");
    expect(source).not.toContain("output:");
  });
});
