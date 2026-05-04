import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard public healthz route", () => {
  test("is the only public unauthenticated runtime health probe", () => {
    const middleware = readFileSync("apps/dashboard/src/middleware.ts", "utf8");
    const route = readFileSync("apps/dashboard/src/app/api/healthz/route.ts", "utf8");

    expect(middleware).toContain('pathname === "/api/healthz"');
    expect(route).toContain("SELECT 1");
    expect(route).toContain("no-store");
    expect(route).not.toContain("process.env");
  });
});
