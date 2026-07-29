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

import { formatSourceList, stripInlineUrls, toWhatsAppText } from "./source-format.js";
import { buildCitedAnswer, formatCitedAnswerForWhatsApp } from "./cited-answer.js";
import type { LiveWebResearchClaim, LiveWebResearchSource } from "./types.js";

export interface VerifiedSourceCollector {
  /** Record provider claims with their native citations. */
  recordClaims(claims: readonly LiveWebResearchClaim[]): void;
  /** Claims recorded so far, in provider order. */
  claims(): LiveWebResearchClaim[];
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
  const recordedClaims: LiveWebResearchClaim[] = [];

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
    recordClaims: (claims) => {
      // Tolerate an absent list: a provider result without citations is valid,
      // it simply yields no deliverable items.
      for (const claim of claims ?? []) if (claim?.citations?.length) recordedClaims.push(claim);
    },
    claims: () => [...recordedClaims],
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
export function applyVerifiedSources(
  text: string,
  sources: readonly LiveWebResearchSource[],
  claims: readonly LiveWebResearchClaim[] = [],
  requestedItems?: number,
): string {
  // Provider citations are the only proof of support, so a turn that has them
  // is always rendered from them — never from anything the local model wrote.
  if (claims.length > 0) {
    return formatCitedAnswerForWhatsApp(buildCitedAnswer(claims, requestedItems));
  }
  if (sources.length === 0) return text;
  // No citations at all (e.g. a one-line weather lookup): prose plus the
  // verified pair list, with no claim of item-level support.
  const lines = formatSourceList([...sources]);
  if (lines.length === 0) return text;
  return [toWhatsAppText(stripInlineUrls(text)), "", "Sources:", ...lines].join("\n").trim();
}
