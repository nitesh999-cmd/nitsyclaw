import { describe, expect, it } from "vitest";
import { likePatternForSearchTerm, normalizeSearchTerm, MAX_SEARCH_TERM_CHARS } from "./search-query";

describe("dashboard search query helpers", () => {
  it("normalizes repeated or long search params", () => {
    expect(normalizeSearchTerm([" coffee ", "tea"])).toBe("coffee");
    expect(normalizeSearchTerm("x".repeat(MAX_SEARCH_TERM_CHARS + 10))).toHaveLength(MAX_SEARCH_TERM_CHARS);
  });

  it("escapes SQL LIKE wildcards and escape characters", () => {
    expect(likePatternForSearchTerm("100%_done\\now")).toBe("%100\\%\\_done\\\\now%");
  });
});
