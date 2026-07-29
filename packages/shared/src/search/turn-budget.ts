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

import { hasUsableFindings } from "./live-web-research.js";
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
  /** Times a repeat ask for the same need was served from the turn cache. */
  reusedThisTurn(): number;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "from", "with", "to", "in", "on", "at", "by",
  "me", "my", "you", "your", "give", "get", "find", "show", "tell", "please", "some", "any",
  "what", "whats", "is", "are", "do", "does", "can", "could", "would", "about", "that", "this",
  "list", "five", "5", "top", "latest", "current", "today", "todays", "now", "verified",
]);

function contentTokens(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

/**
 * Whether a later ask is the same live-research need as the one already served.
 * Deliberately generous: a repeat or narrower restatement counts as the same
 * need, so the model asking again costs nothing. A genuinely different topic
 * shares few content words and falls through to a fresh, budget-limited call.
 */
export function isSameResearchNeed(previous: string, next: string): boolean {
  const before = contentTokens(previous);
  const after = contentTokens(next);
  if (before.size === 0 || after.size === 0) return true;
  let shared = 0;
  for (const token of after) if (before.has(token)) shared += 1;
  return shared / after.size >= 0.6;
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
  let reused = 0;
  let cached: { query: string; result: LiveWebResearchResult } | null = null;

  return {
    maxUses: budget,
    usedThisTurn: () => spent,
    remainingThisTurn: () => Math.max(0, budget - spent),
    providerRequestsThisTurn: () => providerRequests,
    reusedThisTurn: () => reused,

    async research(args: LiveWebResearchRequest): Promise<LiveWebResearchResult> {
      // The turn's live-research need may already be satisfied — e.g. the router
      // pre-searched and the model then asked for the same thing again. Serving
      // that from the turn cache costs zero searches and zero provider requests.
      if (cached && isSameResearchNeed(cached.query, args.query)) {
        reused += 1;
        return cached.result;
      }
      const remaining = Math.max(0, budget - spent);
      if (remaining === 0) {
        // Refused locally. No provider request, so nothing is billed.
        return {
          status: "unavailable",
          answer: "",
          sources: [],
          claims: [],
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
      if (hasUsableFindings(result)) cached = { query: args.query, result };
      return result;
    },

    health(): LiveWebResearchHealth {
      return base.health();
    },
  };
}
