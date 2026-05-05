import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard public-sale mode", () => {
  test("middleware fails closed when public sale is enabled before readiness gates pass", () => {
    const middleware = readFileSync("apps/dashboard/src/middleware.ts", "utf8");

    expect(middleware).toContain("evaluateSaleReadiness");
    expect(middleware).toContain("Public sale mode is not ready");
    expect(middleware).toContain("saleReadiness.mode === \"public-sale\"");
    expect(middleware).toContain("!saleReadiness.ready");
    expect(middleware.indexOf("isAuthPath(request.nextUrl.pathname)")).toBeLessThan(
      middleware.indexOf("publicSaleNotReady(request)"),
    );
  });
});
