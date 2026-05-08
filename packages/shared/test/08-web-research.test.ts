import { describe, expect, it } from "vitest";
import { summarizeResults } from "../src/features/08-web-research.js";
import { makeSerperSearch, noopWebSearch } from "../src/search/serper.js";
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

describe("Serper web search adapter", () => {
  it("maps organic results safely and caps returned items", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({
        organic: Array.from({ length: 7 }, (_, index) => ({
          title: index === 1 ? undefined : `Result ${index}`,
          link: index === 2 ? undefined : `https://example.test/${index}`,
          snippet: index === 3 ? undefined : `Snippet ${index}`,
        })),
      });
    }) as typeof fetch;

    try {
      const results = await makeSerperSearch("api-key").search("electricity plans");

      expect(results).toHaveLength(5);
      expect(results[1]).toEqual({
        title: "(no title)",
        url: "https://example.test/1",
        snippet: "Snippet 1",
      });
      expect(results[2]?.url).toBe("");
      expect(results[3]?.snippet).toBe("");
      expect(calls[0]?.url).toBe("https://google.serper.dev/search");
      expect(calls[0]?.init?.headers).toMatchObject({
        "X-API-KEY": "api-key",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ q: "electricity plans", num: 5 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws status-only search failures without provider body leakage", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("private provider body for nitesh@example.com", {
        status: 500,
        statusText: "Server Error",
      })) as typeof fetch;

    try {
      await expect(makeSerperSearch("api-key").search("medicine")).rejects.toThrow("Serper search failed: HTTP 500");
      await expect(makeSerperSearch("api-key").search("medicine")).rejects.not.toThrow("nitesh@example.com");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns no results when web research is disabled", async () => {
    await expect(noopWebSearch.search("anything")).resolves.toEqual([]);
  });
});
