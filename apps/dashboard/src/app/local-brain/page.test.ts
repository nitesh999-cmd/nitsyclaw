import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local brain dashboard approval guard", () => {
  it("shows only owner-scoped, unexpired pending confirmations", () => {
    const source = readFileSync("apps/dashboard/src/app/local-brain/page.tsx", "utf8");

    expect(source).toContain("eq(confirmations.ownerHash, ownerHash)");
    expect(source).toContain('eq(confirmations.status, "pending")');
    expect(source).toContain("gt(confirmations.expiresAt, new Date())");
  });
});
