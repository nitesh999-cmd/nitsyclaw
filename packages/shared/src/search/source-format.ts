// Leaf module: rendering primitives shared by every delivery path.
// Depends only on types, so it cannot participate in an import cycle.

import type { LiveWebResearchSource } from "./types.js";

/** Cap on sources shown in a single WhatsApp reply. */
export const MAX_WHATSAPP_SOURCES = 4;

/** Collapse anything that could break a title out of its own line. */
export function sanitizeSourceTitle(title: string, url: string): string {
  const cleaned = title.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned) return cleaned.slice(0, 120);
  try {
    return new URL(url).hostname;
  } catch {
    return "source";
  }
}

/**
 * Two lines per pair — title, then its own URL — so a title containing ": " or
 * a dash can never be read as belonging to a neighbouring link.
 */
export function formatSourceList(
  sources: readonly LiveWebResearchSource[],
  limit = MAX_WHATSAPP_SOURCES,
): string[] {
  return sources.slice(0, limit).flatMap((source, index) => [
    `${index + 1}. ${sanitizeSourceTitle(source.title, source.url)}`,
    source.url,
  ]);
}

/**
 * Remove http(s) URLs from model-written prose. Verified links are attached
 * separately, so any URL the model wrote is a duplicate or a mispairing.
 */
export function stripInlineUrls(text: string): string {
  return text
    .replace(/\(\s*https?:\/\/[^\s)]+\s*\)/gi, "")
    .replace(/<\s*https?:\/\/[^\s>]+\s*>/gi, "")
    .replace(/https?:\/\/[^\s<>()[\]]+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** WhatsApp uses single asterisks for bold; markdown `**` renders literally. */
export function toWhatsAppText(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/gs, "*$1*")
    .replace(/\*\*(.+?)\*\*/gs, "*$1*")
    .replace(/\*\*/g, "")
    .replace(/__(.+?)__/gs, "_$1_");
}

/** Only http(s) links may reach the owner. */
export function isSafeSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
