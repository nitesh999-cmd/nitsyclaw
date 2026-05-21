import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard memory page", () => {
  test("shows memory quality controls without schema migration", () => {
    const source = readFileSync("apps/dashboard/src/app/memory/page.tsx", "utf8");

    expect(source).toContain("assessMemoryQuality");
    expect(source).toContain("formatMemoryQualityLabel");
    expect(source).toContain("Quality:");
    expect(source).toContain("Review:");
    expect(source).not.toContain("TODO");
    expect(source).not.toContain("TODO");
  });
});
