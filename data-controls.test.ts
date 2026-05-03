import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("data controls", () => {
  test("settings exposes real export and deletion controls", () => {
    const source = readFileSync("apps/dashboard/src/app/settings/page.tsx", "utf8");

    expect(source).toContain("/api/data/export");
    expect(source).toContain("/api/data/delete");
    expect(source).not.toContain("Coming soon");
    expect(source).not.toContain("disabled");
  });
});
