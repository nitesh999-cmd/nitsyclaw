// Turn-scoped record of verified title/URL pairs.
//
// A single owner turn can reach the provider two ways: the router's pre-search,
// and the model calling `web_research` on its own (an implicit follow-up such as
// "Yes please"). Both must feed the same state, because whichever path delivers
// the reply has to rewrite the model's links with pairs that were actually
// parsed from a search result.
//
// One instance is created per turn and passed through AgentDeps. There is no
// module-level state, so concurrent turns cannot see each other's sources.

import { formatSourceList, stripInlineUrls, type LiveWebResearchSource } from "./live-web-research.js";
import {
  extractIntro,
  formatHeadlineAnswerForWhatsApp,
  parseHeadlineAnswer,
  toWhatsAppText,
} from "./headline-answer.js";

export interface VerifiedSourceCollector {
  /** Record pairs from a successful search. Order is preserved; URLs deduplicate. */
  record(sources: readonly LiveWebResearchSource[]): void;
  /** Pairs recorded so far, in the order they were first seen. */
  list(): LiveWebResearchSource[];
  hasAny(): boolean;
}

export function createVerifiedSourceCollector(
  initial: readonly LiveWebResearchSource[] = [],
): VerifiedSourceCollector {
  const byUrl = new Map<string, LiveWebResearchSource>();

  const record = (sources: readonly LiveWebResearchSource[]): void => {
    for (const source of sources) {
      if (!source?.url) continue;
      // First title for a URL wins, so a later, vaguer label cannot displace the
      // one already shown to the owner.
      if (!byUrl.has(source.url)) byUrl.set(source.url, { title: source.title, url: source.url });
    }
  };

  record(initial);

  return {
    record,
    list: () => [...byUrl.values()],
    hasAny: () => byUrl.size > 0,
  };
}

/**
 * Replace model-written links with verified pairs.
 *
 * With no verified sources the text is returned untouched — an ordinary reply,
 * or one following failed or empty research, must stay byte-identical.
 */
export function applyVerifiedSources(text: string, sources: readonly LiveWebResearchSource[]): string {
  if (sources.length === 0) return text;

  // Preferred shape: the model cited a source title per headline, so each item
  // can be rendered beside the one source that supports it and nothing else is
  // appended.
  const answer = parseHeadlineAnswer(text, sources);
  if (answer.items.length > 0) {
    return formatHeadlineAnswerForWhatsApp(answer, extractIntro(text));
  }

  // No citations to bind. Fall back to prose plus the verified pair list rather
  // than inventing a relationship that was never stated.
  const lines = formatSourceList([...sources]);
  if (lines.length === 0) return text;
  return [toWhatsAppText(stripInlineUrls(text)), "", "Sources:", ...lines].join("\n").trim();
}
