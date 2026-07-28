import { describe, expect, it, vi } from "vitest";
import { createTurnScopedResearcher } from "../src/search/turn-budget.js";
import type { LiveWebResearchRequest, LiveWebResearchResult, LiveWebResearcher } from "../src/search/live-web-research.js";

function baseResearcher(
  maxUses: number,
  reply: (args: LiveWebResearchRequest, call: number) => LiveWebResearchResult,
): { researcher: LiveWebResearcher; calls: LiveWebResearchRequest[] } {
  const calls: LiveWebResearchRequest[] = [];
  return {
    calls,
    researcher: {
      maxUses,
      async research(args) {
        calls.push(args);
        return reply(args, calls.length);
      },
      health: () => ({
        state: "operational",
        provider: "anthropic-web-search",
        toolVersion: "web_search_20250305",
        maxUses,
      }),
    },
  };
}

function ok(searchesUsed: number): LiveWebResearchResult {
  return {
    status: "ok",
    answer: "Answer.",
    sources: [{ title: "S", url: "https://e.example.com/1" }],
    searchesUsed,
  };
}

describe("createTurnScopedResearcher", () => {
  it("shares one allowance across every provider path in the turn", async () => {
    const { researcher, calls } = baseResearcher(5, () => ok(2));
    const turn = createTurnScopedResearcher(researcher);

    // Pre-search path.
    await turn.research({ query: "today's world news" });
    // web_research client-tool path, same turn.
    await turn.research({ query: "world news sources" });

    expect(turn.usedThisTurn()).toBe(4);
    expect(turn.remainingThisTurn()).toBe(1);
    // Second call may only spend what the first left behind.
    expect(calls[0]!.maxUses).toBe(5);
    expect(calls[1]!.maxUses).toBe(3);
  });

  it("never lets one turn exceed the configured total, however many calls are made", async () => {
    const { researcher, calls } = baseResearcher(5, (args) => ok(args.maxUses ?? 0));
    const turn = createTurnScopedResearcher(researcher);

    for (let i = 0; i < 10; i++) await turn.research({ query: `q${i}` });

    expect(turn.usedThisTurn()).toBe(5);
    const totalAllowanceHandedOut = calls.reduce((sum, call) => sum + (call.maxUses ?? 0), 0);
    expect(totalAllowanceHandedOut).toBeLessThanOrEqual(5);
  });

  it("refuses locally once the budget is spent, issuing no provider request", async () => {
    const { researcher, calls } = baseResearcher(5, () => ok(5));
    const turn = createTurnScopedResearcher(researcher);

    await turn.research({ query: "first" });
    const second = await turn.research({ query: "second" });

    expect(calls).toHaveLength(1);
    expect(turn.providerRequestsThisTurn()).toBe(1);
    expect(second).toMatchObject({
      status: "unavailable",
      failureCode: "max_uses_exceeded",
      searchesUsed: 0,
      answer: "",
    });
  });

  it("does not charge the budget for failed searches, which the provider does not bill", async () => {
    const { researcher } = baseResearcher(5, () => ({
      status: "unavailable",
      answer: "",
      sources: [],
      searchesUsed: 0,
      failureCode: "rate_limited",
    }));
    const turn = createTurnScopedResearcher(researcher);

    await turn.research({ query: "first" });

    expect(turn.usedThisTurn()).toBe(0);
    expect(turn.remainingThisTurn()).toBe(5);
  });

  it("honours a smaller caller ask but never raises the ceiling", async () => {
    const { researcher, calls } = baseResearcher(5, () => ok(1));
    const turn = createTurnScopedResearcher(researcher);

    await turn.research({ query: "cheap", maxUses: 1 });
    await turn.research({ query: "greedy", maxUses: 99 });

    expect(calls[0]!.maxUses).toBe(1);
    expect(calls[1]!.maxUses).toBe(4);
  });

  it("cannot be constructed with a budget above the base researcher's maximum", () => {
    const { researcher } = baseResearcher(5, () => ok(1));

    expect(createTurnScopedResearcher(researcher, 50).maxUses).toBe(5);
    expect(createTurnScopedResearcher(researcher, 2).maxUses).toBe(2);
  });

  it("passes the underlying health signal straight through", () => {
    const { researcher } = baseResearcher(5, () => ok(1));
    const health = vi.spyOn(researcher, "health");

    createTurnScopedResearcher(researcher).health();

    expect(health).toHaveBeenCalledTimes(1);
  });
});
