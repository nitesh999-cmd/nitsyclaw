import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("settings readiness copy", () => {
  test("keeps readiness language plain for normal home users", () => {
    const source = readFileSync("apps/dashboard/src/app/settings/page.tsx", "utf8");

    expect(source).toContain('label="Ready for me"');
    expect(source).toContain('label="Ready for customers"');
    expect(source).toContain("Not ready to sell yet");
    expect(source).toContain("customer accounts");
    expect(source).toContain("Keep each customer's data separate");
    expect(source).toContain("Advanced status");
    expect(source).not.toContain("Mode: {saleReadiness.mode}");
  });
});
