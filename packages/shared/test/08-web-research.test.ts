import { describe, expect, it } from "vitest";
import { registerWebResearch, runWebResearch } from "../src/features/08-web-research.js";
import { ToolRegistry, type ToolContext } from "../src/agent/tools.js";
import { makeSerperSearch, noopWebSearch } from "../src/search/serper.js";
import { makeAgentDeps, makeFakeLiveResearcher } from "./helpers.js";
import type { AgentDeps } from "../src/agent/deps.js";

function ctx(overrides: Partial<AgentDeps> = {}): ToolContext {
  const deps = makeAgentDeps(overrides);
  return { userPhone: "+61400000000", now: deps.now(), timezone: deps.timezone, deps };
}

describe("web_research tool", () => {
  it("is registered so the model can search inside the agent loop", () => {
    const registry = new ToolRegistry();
    registerWebResearch(registry);

    const tool = registry.get("web_research");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("never ask the user for permission");
  });

  it("returns the live answer with sources", async () => {
    const out = await runWebResearch("today's world news", ctx());

    expect(out.available).toBe(true);
    expect(out.status).toBe("ok");
    expect(out.answer).toBe("Live answer from search.");
    expect(out.sources).toEqual([{ title: "Example source", url: "https://example.com/story" }]);
  });

  it("reports unavailable — not a stale answer — when no researcher is wired", async () => {
    const toolCtx = ctx();
    delete toolCtx.deps.liveResearch;

    const out = await runWebResearch("today's news", toolCtx);

    expect(out.available).toBe(false);
    expect(out.answer).toBe("");
    expect(out.message).toContain("can't get live web results");
  });

  it("reports unavailable when the search itself failed", async () => {
    const out = await runWebResearch(
      "today's news",
      ctx({
        liveResearch: makeFakeLiveResearcher({
          status: "unavailable",
          answer: "",
          sources: [],
          failureCode: "rate_limited",
        }),
      }),
    );

    expect(out.available).toBe(false);
    expect(out.status).toBe("unavailable");
    expect(out.message).toContain("rate limited");
  });

  it("tells the model to say so when a search returned nothing", async () => {
    const out = await runWebResearch(
      "obscure query",
      ctx({ liveResearch: makeFakeLiveResearcher({ status: "no_results", answer: "", sources: [] }) }),
    );

    expect(out.available).toBe(true);
    expect(out.status).toBe("no_results");
    expect(out.message).toContain("do not answer from older knowledge");
  });

  it("caps the number of sources it hands back to the model", async () => {
    const out = await runWebResearch(
      "news",
      ctx({
        liveResearch: makeFakeLiveResearcher({
          sources: Array.from({ length: 9 }, (_, i) => ({ title: `S${i}`, url: `https://e.example.com/${i}` })),
        }),
      }),
    );

    expect(out.sources).toHaveLength(4);
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
