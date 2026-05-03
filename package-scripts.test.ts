import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("package scripts", () => {
  test("dashboard typecheck generates Next route types before tsc", () => {
    const dashboardPackage = JSON.parse(
      readFileSync("apps/dashboard/package.json", "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(dashboardPackage.scripts?.typecheck).toBe(
      "next typegen && tsc --noEmit",
    );
  });
});
