// Leaf module: live web research types only. No imports, so nothing can form a
// cycle through it.

export type LiveWebResearchStatus = "ok" | "no_results" | "unavailable";

export type LiveWebResearchFailureCode =
  | "not_configured"
  | "disabled_by_config"
  | "provider_disabled"
  | "unsupported_model"
  | "rate_limited"
  | "max_uses_exceeded"
  | "query_rejected"
  | "search_error"
  | "request_failed"
  | "no_search_performed";

export interface LiveWebResearchSource {
  title: string;
  url: string;
}

/**
 * A provider-supplied citation. `citedText` is the excerpt the provider itself
 * attached as support — it is the evidence of relevance, replacing any guess
 * based on titles or URL shape.
 */
export interface LiveWebResearchCitation extends LiveWebResearchSource {
  citedText: string;
}

/**
 * One text span from the provider together with the citations the provider
 * attached to that span. The pairing is the provider's, never ours and never
 * the local model's, so it cannot be reassigned downstream.
 */
export interface LiveWebResearchClaim {
  text: string;
  citations: LiveWebResearchCitation[];
}

export interface LiveWebResearchResult {
  status: LiveWebResearchStatus;
  /** Model prose. Empty when status is "unavailable". */
  answer: string;
  sources: LiveWebResearchSource[];
  /** Per-span claims with their native citations, in provider order. */
  claims: LiveWebResearchClaim[];
  /** Number of server-side searches the model actually ran. */
  searchesUsed: number;
  failureCode?: LiveWebResearchFailureCode;
}

export interface LiveWebResearchHealth {
  state: "operational" | "configured" | "unavailable";
  provider: "anthropic-web-search";
  toolVersion: string;
  maxUses: number;
  lastCheckedAt?: string;
  lastFailureCode?: LiveWebResearchFailureCode;
}

export interface LiveWebResearchRequest {
  query: string;
  instructions?: string;
  maxUses?: number;
}

export interface LiveWebResearcher {
  readonly maxUses: number;
  research(args: LiveWebResearchRequest): Promise<LiveWebResearchResult>;
  health(): LiveWebResearchHealth;
}

/** Minimal structural shape of an Anthropic message response. */
export interface RawResponseLike {
  stop_reason?: string | null;
  content?: unknown;
}
