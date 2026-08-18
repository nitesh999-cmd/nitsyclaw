// Anthropic server-side web search, reached through the existing ANTHROPIC_API_KEY.
//
// One research call = one bounded Anthropic request (plus pause_turn continuations).
// The conversation stays inside this function, so encrypted search content never
// has to survive our own string-based agent loop, and nothing encrypted ever
// escapes to logs, storage, or WhatsApp.

import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_WEB_SEARCH_TOOL_VERSION,
  DEFAULT_WEB_SEARCH_MAX_USES,
  parseWebSearchResponse,
  type LiveWebResearchFailureCode,
  type LiveWebResearchHealth,
  type LiveWebResearchResult,
  type LiveWebResearcher,
  type RawResponseLike,
} from "./live-web-research.js";
import type { WebSearcher } from "../agent/deps.js";

/** Bound on paused-turn continuations, so a stuck turn can never loop forever. */
const MAX_PAUSE_TURN_CONTINUATIONS = 2;

const RESEARCH_SYSTEM_PROMPT = [
  "You answer questions using live web search results only.",
  "Always run at least one search before answering — never answer a current-information question from memory.",
  "Never ask the user whether you should search; the search has already been authorised.",
  "Never mention a training cutoff. If the search results do not answer the question, say so plainly.",
  "Reply in compact plain text suitable for WhatsApp: no markdown tables, no headings, short lines.",
  "Attribute every factual statement with the search tool's own citations; do not write source names or URLs yourself.",
].join(" ");

/** Minimal shape of the Messages API call, so tests can inject a fake. */
export type MessageCreateLike = (params: {
  model: string;
  max_tokens: number;
  system: string;
  tools: unknown[];
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
}) => Promise<RawResponseLike>;

export interface AnthropicWebResearcherOptions {
  apiKey?: string;
  model: string;
  maxUses?: number;
  maxTokens?: number;
  /** Injected in tests; production uses the real SDK client. */
  create?: MessageCreateLike;
  now?: () => Date;
}

export function makeAnthropicWebResearcher(options: AnthropicWebResearcherOptions): LiveWebResearcher {
  const maxUses = normalizeMaxUses(options.maxUses);
  const maxTokens = options.maxTokens ?? 1_200;
  const now = options.now ?? (() => new Date());
  const create: MessageCreateLike =
    options.create ??
    (() => {
      const client = new Anthropic({ apiKey: options.apiKey });
      return ((params) =>
        client.messages.create(params as never) as unknown as Promise<RawResponseLike>) as MessageCreateLike;
    })();

  let lastCheckedAt: string | undefined;
  let lastFailureCode: LiveWebResearchFailureCode | undefined;
  let lastSucceeded = false;

  return {
    maxUses,

    async research({ query, instructions, maxUses: requestedMaxUses }): Promise<LiveWebResearchResult> {
      lastCheckedAt = now().toISOString();
      // A caller may spend less than the configured maximum (the per-turn budget
      // hands over only what is left) but never more.
      const callMaxUses =
        requestedMaxUses === undefined ? maxUses : Math.min(maxUses, normalizeMaxUses(requestedMaxUses));
      const trimmed = query.trim();
      if (!trimmed) {
        lastSucceeded = false;
        lastFailureCode = "query_rejected";
        return { status: "unavailable", answer: "", sources: [], claims: [], searchesUsed: 0, failureCode: "query_rejected" };
      }

      const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
        { role: "user", content: instructions ? `${instructions}\n\n${trimmed}` : trimmed },
      ];
      const collectedContent: unknown[] = [];

      try {
        for (let attempt = 0; attempt <= MAX_PAUSE_TURN_CONTINUATIONS; attempt++) {
          const response = await create({
            model: options.model,
            max_tokens: maxTokens,
            system: RESEARCH_SYSTEM_PROMPT,
            tools: [
              {
                type: ANTHROPIC_WEB_SEARCH_TOOL_VERSION,
                name: "web_search",
                max_uses: callMaxUses,
              },
            ],
            messages,
          });
          const content = Array.isArray(response.content) ? response.content : [];
          collectedContent.push(...content);

          if (response.stop_reason !== "pause_turn") break;
          if (attempt === MAX_PAUSE_TURN_CONTINUATIONS) break;
          // Per the API contract, a paused turn resumes by sending the assistant
          // message back byte-for-byte, including every encrypted field.
          messages.push({ role: "assistant", content });
        }
      } catch (error) {
        const failureCode = mapRequestError(error);
        lastSucceeded = false;
        lastFailureCode = failureCode;
        return { status: "unavailable", answer: "", sources: [], claims: [], searchesUsed: 0, failureCode };
      }

      const result = parseWebSearchResponse({ content: collectedContent });
      lastSucceeded = result.status !== "unavailable";
      lastFailureCode = result.status === "unavailable" ? result.failureCode : undefined;
      return result;
    },

    health(): LiveWebResearchHealth {
      const state: LiveWebResearchHealth["state"] = lastFailureCode
        ? "unavailable"
        : lastSucceeded
          ? "operational"
          : "configured";
      return {
        state,
        provider: "anthropic-web-search",
        toolVersion: ANTHROPIC_WEB_SEARCH_TOOL_VERSION,
        maxUses,
        ...(lastCheckedAt ? { lastCheckedAt } : {}),
        ...(lastFailureCode ? { lastFailureCode } : {}),
      };
    },
  };
}

function normalizeMaxUses(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_WEB_SEARCH_MAX_USES;
  return Math.min(10, Math.max(1, Math.floor(value)));
}

/**
 * Map transport failures to non-secret codes. The raw error is never returned to
 * the caller, so provider messages (which can echo request ids) stay internal.
 */
export function mapRequestError(error: unknown): LiveWebResearchFailureCode {
  const status = readStatus(error);
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "provider_disabled";
  if (status === 400) {
    if (message.includes("web search") || message.includes("web_search")) {
      return message.includes("model") ? "unsupported_model" : "provider_disabled";
    }
    return "query_rejected";
  }
  if (status === 404) return "unsupported_model";
  return "request_failed";
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Adapter for the legacy `WebSearcher` seam (morning-brief weather, etc.).
 * Returns an empty list when live research is unavailable so callers omit the
 * section instead of printing a placeholder that reads like real data.
 */
export function toWebSearcher(researcher: LiveWebResearcher): WebSearcher {
  return {
    async search(query: string) {
      const result = await researcher.research({
        query,
        instructions: "Search the web and answer in one or two short factual sentences.",
      });
      if (result.status !== "ok") return [];
      const snippet = result.answer.replace(/\s+/g, " ").trim();
      if (result.sources.length === 0) {
        return snippet ? [{ title: query, url: "", snippet }] : [];
      }
      return result.sources.map((source, index) => ({
        title: source.title,
        url: source.url,
        // Only the first row carries the prose, so callers that read
        // `results[0].snippet` (morning brief) get the real summary.
        snippet: index === 0 ? snippet : "",
      }));
    },
  };
}
