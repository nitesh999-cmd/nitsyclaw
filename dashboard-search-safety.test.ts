import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard search safety", () => {
  test("search inputs are bounded before database queries", () => {
    const helper = readFileSync("apps/dashboard/src/lib/search-query.ts", "utf8");
    expect(helper).toContain("MAX_SEARCH_TERM_CHARS");
    expect(helper).toContain(".slice(0, MAX_SEARCH_TERM_CHARS)");

    for (const file of [
      "apps/dashboard/src/app/api/search/route.ts",
      "apps/dashboard/src/app/search/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("normalizeSearchTerm");
    }
  });

  test("search escapes wildcard characters before LIKE queries", () => {
    for (const file of [
      "apps/dashboard/src/app/api/search/route.ts",
      "apps/dashboard/src/app/search/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("likePatternForSearchTerm");
      expect(source, file).toContain("ESCAPE");
    }
  });
});
