import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard memory page", () => {
  test("shows memory quality controls without schema migration", () => {
    const source = readFileSync("apps/dashboard/src/app/memory/page.tsx", "utf8");

    expect(source).toContain("assessMemoryQuality");
    expect(source).toContain("formatMemoryQualityLabel");
    expect(source).toContain("Review inbox");
    expect(source).toContain("/api/memory/review");
    expect(source).toContain("Save edit");
    expect(source).toContain("Pin");
    expect(source).toContain("Downgrade");
    expect(source).toContain("Expire");
    expect(source).toContain("Delete");
    expect(source).toContain("Quality:");
    expect(source).toContain("Review:");
    expect(source).not.toContain("TODO");
  });

  test("memory review route supports safe owner review actions", () => {
    const source = readFileSync("apps/dashboard/src/app/api/memory/review/route.ts", "utf8");

    expect(source).toContain("requireSameOrigin");
    expect(source).toContain("updateMemory");
    expect(source).toContain("deleteMemory");
    expect(source).toContain("pin");
    expect(source).toContain("downgrade");
    expect(source).toContain("expire");
    expect(source).toContain("edit");
    expect(source).toContain("Cache-Control");
    expect(source).toContain("no-store");
  });
});
