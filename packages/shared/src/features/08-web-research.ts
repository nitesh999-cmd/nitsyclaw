// Feature 8: Web research — live, cited answers for anything past the model's knowledge.
//
// Backed by Anthropic's server-side web search tool (see
// packages/shared/src/search/anthropic-web-research.ts). The tool never returns
// encrypted search content, tool ids, or raw API payloads — only prose plus
// source title/URL pairs.

import { z } from "zod";
import {
  formatLiveWebResearchUnavailable,
  hasUsableFindings,
  normalizeFailureCode,
  type LiveWebResearchFailureCode,
  type LiveWebResearchResult,
} from "../search/live-web-research.js";
import { formatLocalDateInstruction, resolveLocalDateContext } from "../search/local-date.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export interface WebResearchToolOutput {
  available: boolean;
  status: LiveWebResearchResult["status"];
  answer: string;
  sources: Array<{ title: string; url: string }>;
  searchesUsed: number;
  /**
   * Sanitized failure category, stored in the audit trail so a failed turn can
   * be diagnosed later without a live repro. Only known internal codes are ever
   * recorded; anything else collapses to `request_failed`.
   */
  failureCode?: LiveWebResearchFailureCode;
  message?: string;
}

const MAX_SOURCES_RETURNED = 4;

export async function runWebResearch(query: string, ctx: ToolContext): Promise<WebResearchToolOutput> {
  const researcher = ctx.deps.liveResearch;
  if (!researcher) {
    return {
      available: false,
      status: "unavailable",
      answer: "",
      sources: [],
      searchesUsed: 0,
      failureCode: "not_configured",
      message: formatLiveWebResearchUnavailable("not_configured"),
    };
  }

  // "Today" must mean the owner's local day, not the server's UTC day.
  const result = await researcher.research({
    query,
    instructions: formatLocalDateInstruction(resolveLocalDateContext(ctx.now, ctx.timezone)),
  });
  if (result.status === "unavailable") {
    const failureCode = normalizeFailureCode(result.failureCode);
    return {
      available: false,
      status: "unavailable",
      answer: "",
      sources: [],
      searchesUsed: result.searchesUsed,
      failureCode,
      message: formatLiveWebResearchUnavailable(failureCode),
    };
  }

  // Record the pairs for this turn so whichever path delivers the reply can
  // replace model-written links with links that were actually searched.
  if (hasUsableFindings(result)) {
    ctx.deps.verifiedSources?.record(result.sources);
    ctx.deps.verifiedSources?.recordClaims(result.claims);
  }

  return {
    available: true,
    status: result.status,
    answer: result.answer,
    sources: result.sources.slice(0, MAX_SOURCES_RETURNED),
    searchesUsed: result.searchesUsed,
    ...(result.status === "no_results"
      ? { message: "The search returned no usable results. Say so; do not answer from older knowledge." }
      : {}),
  };
}

export function registerWebResearch(registry: ToolRegistry): void {
  registry.register({
    name: "web_research",
    description:
      "Search the live web and return a short answer with source titles and URLs. Use this for news, weather, prices, scores, recent events, or any explicit request to search. Call it immediately — never ask the user for permission first. If it reports available=false, tell the user live search is unavailable and do not answer from older knowledge.",
    inputSchema: z.object({
      query: z.string().min(2),
    }),
    handler: async (input: { query: string }, ctx: ToolContext) => runWebResearch(input.query, ctx),
  });
}
