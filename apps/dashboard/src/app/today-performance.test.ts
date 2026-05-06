import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("today dashboard performance guard", () => {
  it("uses a bounded storage timeout so login cannot buffer forever", () => {
    const source = readFileSync("apps/dashboard/src/app/page.tsx", "utf8");

    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("NITSYCLAW_TODAY_TIMEOUT_MS");
    expect(source).toContain("loadTodayWithTimeout");
    expect(source).toContain("Promise.race");
    expect(source).toContain("emptyTodayData");
  });
});
