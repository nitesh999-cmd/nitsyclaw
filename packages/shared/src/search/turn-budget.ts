// One owner turn gets ONE server-search budget, shared by every path that can
// reach the provider.
//
// A single WhatsApp turn has two independent routes to Anthropic web search:
// the router's pre-search (an explicit current-information request searches
// before the agent loop starts) and the `web_research` client tool the model can
// call inside that loop, up to the loop's round cap. Each route used to carry
// its own `max_uses`, so one owner message could bill 5 searches per invocation
// rather than 5 in total.
//
// createTurnScopedResearcher wraps the shared researcher for the duration of one
// turn and hands each successive call only the allowance that is left. When the
// budget is spent, further calls are refused locally — no provider request is
// issued at all.

import type {
  LiveWebResearchHealth,
  LiveWebResearchRequest,
  LiveWebResearchResult,
  LiveWebResearcher,
} from "./live-web-research.js";

export interface TurnScopedResearcher extends LiveWebResearcher {
  /** Server searches already spent in this turn. */
  usedThisTurn(): number;
  /** Server searches still available in this turn. */
  remainingThisTurn(): number;
  /** Provider requests issued in this turn (not searches — one request may run several). */
  providerRequestsThisTurn(): number;
}

/**
 * @param base       the long-lived researcher (its own `maxUses` is the ceiling)
 * @param maxUses    total searches allowed across this one turn; defaults to the
 *                   base researcher's configured maximum and is never allowed to
 *                   exceed it
 */
export function createTurnScopedResearcher(base: LiveWebResearcher, maxUses?: number): TurnScopedResearcher {
  const budget = Math.max(0, Math.min(base.maxUses, maxUses ?? base.maxUses));
  let spent = 0;
  let providerRequests = 0;

  return {
    maxUses: budget,
    usedThisTurn: () => spent,
    remainingThisTurn: () => Math.max(0, budget - spent),
    providerRequestsThisTurn: () => providerRequests,

    async research(args: LiveWebResearchRequest): Promise<LiveWebResearchResult> {
      const remaining = Math.max(0, budget - spent);
      if (remaining === 0) {
        // Refused locally. No provider request, so nothing is billed.
        return {
          status: "unavailable",
          answer: "",
          sources: [],
          searchesUsed: 0,
          failureCode: "max_uses_exceeded",
        };
      }
      // Never hand out more than what is left, and honour a smaller caller ask.
      const allowance = args.maxUses === undefined ? remaining : Math.min(remaining, Math.max(1, args.maxUses));
      providerRequests += 1;
      const result = await base.research({ ...args, maxUses: allowance });
      // Failed searches are not billed by the provider, and `searchesUsed` is 0
      // on those, so this only ever charges the budget for real searches.
      spent += Math.max(0, result.searchesUsed);
      return result;
    },

    health(): LiveWebResearchHealth {
      return base.health();
    },
  };
}
