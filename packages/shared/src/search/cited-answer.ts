// Delivery built from provider-supplied citations.
//
// The provider attaches citations to the specific text span they support. That
// relationship is the only proof of support we have, and it is the one thing a
// local model cannot recreate: matching a source *title* proves the title
// exists in the verified set, not that the page supports the claim.
//
// Items are therefore built from native claims only. No SOURCE marker, source
// title, source index, URL shape, or model assertion is ever treated as proof.

import { sanitizeSourceTitle, stripInlineUrls, toWhatsAppText } from "./source-format.js";
import type { LiveWebResearchCitation, LiveWebResearchClaim } from "./types.js";

export interface CitedItem {
  text: string;
  citations: LiveWebResearchCitation[];
}

export interface CitedAnswer {
  items: CitedItem[];
  /** Items the owner asked for, when the request stated a number. */
  requested?: number;
  /** True when fewer verified items exist than were requested. */
  partial: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};

const COUNT_RE =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,3}?(?:headlines?|stories|items?|articles?|results?|updates?|things?)\b/i;

/** How many items the owner asked for, when they said so. */
export function parseRequestedItemCount(message: string): number | undefined {
  const match = COUNT_RE.exec(message);
  if (!match) return undefined;
  const token = (match[1] ?? "").toLowerCase();
  const value = NUMBER_WORDS[token] ?? Number(token);
  return Number.isFinite(value) && value > 0 && value <= 20 ? value : undefined;
}

/** A claim is deliverable only if the provider attached at least one citation. */
function isSupported(claim: LiveWebResearchClaim): boolean {
  return claim.text.trim().length > 0 && claim.citations.length > 0;
}

/**
 * Build the deliverable items from native claims.
 *
 * Nothing here consults titles, URL shape, or anything the local model wrote —
 * a claim ships only because the provider cited it.
 */
export function buildCitedAnswer(
  claims: readonly LiveWebResearchClaim[],
  requested?: number,
): CitedAnswer {
  const supported = (claims ?? []).filter(isSupported).map((claim) => ({
    text: stripInlineUrls(claim.text).trim(),
    citations: claim.citations,
  })).filter((item) => item.text.length > 0);

  const items = requested === undefined ? supported : supported.slice(0, requested);
  return {
    items,
    ...(requested === undefined ? {} : { requested }),
    partial: requested !== undefined && items.length < requested,
  };
}

/**
 * Render each item immediately above the citations the provider attached to it.
 * Only those citations appear, so an unused search result is never delivered.
 */
export function formatCitedAnswerForWhatsApp(answer: CitedAnswer, intro = ""): string {
  if (answer.items.length === 0) {
    return "I searched the web but could not verify any item against a source. I won't fill the gap from memory.";
  }

  const blocks = answer.items.map((item, index) => {
    const seen = new Set<string>();
    const lines = [`${index + 1}. ${toWhatsAppText(item.text)}`];
    for (const citation of item.citations) {
      if (seen.has(citation.url)) continue;
      seen.add(citation.url);
      lines.push(sanitizeSourceTitle(citation.title, citation.url), citation.url);
    }
    return lines.join("\n");
  });

  const head = toWhatsAppText(stripInlineUrls(intro)).trim();
  const note = answer.partial
    ? `I could verify ${answer.items.length} of the ${answer.requested} you asked for. The rest were not supported by a source, so I left them out.`
    : "";

  return [head, ...blocks, note].filter(Boolean).join("\n\n").trim();
}
