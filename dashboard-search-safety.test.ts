import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard search safety", () => {
  test("search inputs are bounded before database queries", () => {
    for (const file of [
      "apps/dashboard/src/app/api/search/route.ts",
      "apps/dashboard/src/app/search/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("MAX_SEARCH_TERM_CHARS");
      expect(source, file).toContain(".slice(0, MAX_SEARCH_TERM_CHARS)");
    }
  });
});
