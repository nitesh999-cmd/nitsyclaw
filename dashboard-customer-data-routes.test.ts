import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("customer data API route public-sale guards", () => {
  const guardedRoutes = [
    {
      path: "apps/dashboard/src/app/api/memory/review/route.ts",
      before: "req.formData()",
    },
    {
      path: "apps/dashboard/src/app/api/search/route.ts",
      before: "const q = likePatternForSearchTerm(term)",
    },
    {
      path: "apps/dashboard/src/app/api/stats/route.ts",
      before: "const db = getDb()",
    },
  ];

  it("fails closed before reading or mutating customer data in public-sale mode", () => {
    for (const route of guardedRoutes) {
      const source = readFileSync(route.path, "utf8");

      expect(source).toContain("blockPublicSaleCustomerDataAccess");
      expect(source.indexOf("blockPublicSaleCustomerDataAccess()")).toBeGreaterThan(0);
      expect(source.indexOf("blockPublicSaleCustomerDataAccess()")).toBeLessThan(
        source.indexOf(route.before),
      );
    }
  });
});
