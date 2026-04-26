import { describe, expect, it } from "vitest";
import { summarizeResults } from "../src/features/08-web-research.js";
import { fakeLlm, fakeWebSearch } from "./helpers.js";

describe("summarizeResults", () => {
  it("returns LLM summary text", async () => {
    const results = await fakeWebSearch.search("solar tariffs");
    const out = await summarizeResults({ query: "solar tariffs", results, llm: fakeLlm });
    expect(out).toMatch(/fake-llm reply/);
  });

  it("handles empty results", async () => {
    const out = await summarizeResults({ query: "x", results: [], llm: fakeLlm });
    expect(out).toBe("No results found.");
  });
});
