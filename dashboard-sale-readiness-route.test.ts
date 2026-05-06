import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard sale readiness route", () => {
  test("exposes a protected no-store sale-readiness gate", () => {
    const route = readFileSync("apps/dashboard/src/app/api/sale-readiness/route.ts", "utf8");
    const middleware = readFileSync("apps/dashboard/src/proxy.ts", "utf8");

    expect(route).toContain("evaluateSaleReadiness");
    expect(route).toContain("Cache-Control");
    expect(route).toContain("no-store");
    expect(middleware).toContain('return pathname === "/api/sale-readiness"');
    expect(middleware.indexOf("isSaleReadinessPath(request.nextUrl.pathname)")).toBeLessThan(
      middleware.indexOf("publicSaleNotReady(request)"),
    );
  });
});
