// Single wiring rule for live web research, shared by the bot and the dashboard
// so both surfaces agree on what "web research is available" means.
//
// Anthropic's server-side web search is the primary backend and reuses the
// existing ANTHROPIC_API_KEY — no separate search vendor or key is introduced.
// A pre-existing SERPER_API_KEY still serves the legacy `webSearch` seam for
// installs that already have one. With neither, research reports itself
// unavailable rather than returning placeholder text that reads like data.

import { makeAnthropicWebResearcher, toWebSearcher } from "./anthropic-web-research.js";
import { DEFAULT_WEB_SEARCH_MAX_USES, makeUnavailableResearcher, type LiveWebResearcher } from "./live-web-research.js";
import { makeSerperSearch, noopWebSearch } from "./serper.js";
import type { WebSearcher } from "../agent/deps.js";

export interface WebResearchConfig {
  anthropicApiKey?: string;
  anthropicModel: string;
  /** false switches live research off entirely. */
  enabled?: boolean;
  maxUses?: number;
  serperApiKey?: string;
}

export interface WebResearchWiring {
  researcher: LiveWebResearcher;
  webSearch: WebSearcher;
}

export function createWebResearch(config: WebResearchConfig): WebResearchWiring {
  if (config.enabled === false) {
    return { researcher: makeUnavailableResearcher("disabled_by_config"), webSearch: noopWebSearch };
  }
  if (config.anthropicApiKey) {
    const researcher = makeAnthropicWebResearcher({
      apiKey: config.anthropicApiKey,
      model: config.anthropicModel,
      maxUses: config.maxUses ?? DEFAULT_WEB_SEARCH_MAX_USES,
    });
    return { researcher, webSearch: toWebSearcher(researcher) };
  }
  if (config.serperApiKey) {
    return {
      researcher: makeUnavailableResearcher("not_configured"),
      webSearch: makeSerperSearch(config.serperApiKey),
    };
  }
  return { researcher: makeUnavailableResearcher("not_configured"), webSearch: noopWebSearch };
}
