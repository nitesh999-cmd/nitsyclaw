import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard debug page", () => {
  test("does not expose DATABASE_URL shape by default", () => {
    const source = readFileSync("apps/dashboard/src/app/debug/page.tsx", "utf8");

    expect(source).not.toContain("process.env.DATABASE_URL");
    expect(source).not.toContain("head (first 20)");
    expect(source).not.toContain("tail (last 20)");
  });

  test("cannot render in production even with debug env flags", () => {
    const source = readFileSync("apps/dashboard/src/app/debug/page.tsx", "utf8");

    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).not.toContain("NITSYCLAW_DEBUG_BREAK_GLASS");
  });
});
