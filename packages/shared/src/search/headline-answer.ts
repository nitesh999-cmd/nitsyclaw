// Headline-to-source relationships.
//
// Atomic title/URL pairing (R70) guarantees a title stays with its own link. It
// does not say which link supports which headline. The live proof showed the
// gap: three headlines were delivered, then four verified sources were appended
// as a flat list — including a section index and a general bulletin that mapped
// to no particular headline.
//
// The fix is to make the model cite by exact source title, then bind each
// headline to the verified pair whose title it named. Only cited sources are
// rendered, so an unused search result is never appended.

import { sanitizeSourceTitle, stripInlineUrls, type LiveWebResearchSource } from "./live-web-research.js";

/** Marker the prompts ask for: "1. <headline> SOURCE: <exact source title>". */
const SOURCE_MARKER_RE = /\s*SOURCE:\s*(.+?)\s*$/i;
const LIST_PREFIX_RE = /^\s*(?:\d+[.)]|[-*•])\s*/;

export interface HeadlineItem {
  headline: string;
  source: LiveWebResearchSource;
}

export interface HeadlineAnswer {
  items: HeadlineItem[];
  /** Cited titles that matched no verified source. Never rendered. */
  unmatched: number;
}

/**
 * Section fronts and general bulletins. They are legitimate search results but
 * cannot support a specific headline, so they are dropped whenever a real
 * article is available for the same turn.
 */
const INDEX_PATH_RE =
  /^\/?(?:|news|world|world-news|latest|latest-news|home|index(?:\.html?)?|topics?|section|sections|category|categories|live|breaking)\/?$/i;

export function isGenericIndexUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.search || parsed.hash) return false;
    return INDEX_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Sources a headline may cite. Index pages survive only when nothing better
 * exists, so a turn with real articles never offers a section front.
 */
export function selectCitableSources(sources: readonly LiveWebResearchSource[]): LiveWebResearchSource[] {
  const articles = sources.filter((source) => !isGenericIndexUrl(source.url));
  return articles.length > 0 ? articles : [...sources];
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Bind each cited headline to the verified pair whose title it named.
 *
 * A citation that matches no verified source is dropped along with its headline
 * — delivering the headline without a supporting link would be exactly the
 * unmapped-source defect this replaces.
 */
export function parseHeadlineAnswer(
  text: string,
  sources: readonly LiveWebResearchSource[],
): HeadlineAnswer {
  const citable = selectCitableSources(sources);
  const byTitle = new Map(citable.map((source) => [normalizeTitle(source.title), source]));
  const items: HeadlineItem[] = [];
  const usedUrls = new Set<string>();
  let unmatched = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const marker = SOURCE_MARKER_RE.exec(line);
    if (!marker) continue;

    const citedTitle = normalizeTitle(marker[1] ?? "");
    const headline = stripInlineUrls(line.replace(SOURCE_MARKER_RE, "").replace(LIST_PREFIX_RE, "")).trim();
    if (!headline) continue;

    const source =
      byTitle.get(citedTitle) ??
      citable.find((candidate) => {
        const candidateTitle = normalizeTitle(candidate.title);
        return candidateTitle.includes(citedTitle) || citedTitle.includes(candidateTitle);
      });

    if (!source || !citedTitle) {
      unmatched += 1;
      continue;
    }
    items.push({ headline, source });
    usedUrls.add(source.url);
  }

  return { items, unmatched };
}

/** WhatsApp uses single asterisks for bold. Markdown `**` renders literally. */
export function toWhatsAppText(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/gs, "*$1*")
    .replace(/\*\*(.+?)\*\*/gs, "*$1*")
    .replace(/\*\*/g, "")
    .replace(/__(.+?)__/gs, "_$1_");
}

/**
 * Render each headline immediately above the one source that supports it, so
 * the relationship is visible rather than implied by a trailing list.
 */
export function formatHeadlineAnswerForWhatsApp(answer: HeadlineAnswer, intro = ""): string {
  const blocks = answer.items.map((item, index) =>
    [`${index + 1}. ${toWhatsAppText(item.headline)}`, sanitizeSourceTitle(item.source.title, item.source.url), item.source.url].join("\n"),
  );
  const head = toWhatsAppText(stripInlineUrls(intro)).trim();
  return [head, ...blocks].filter(Boolean).join("\n\n").trim();
}

/** Prose that precedes the first cited headline — kept as the reply's opening line. */
export function extractIntro(text: string): string {
  const lines = text.split(/\r?\n/);
  const firstCited = lines.findIndex((line) => SOURCE_MARKER_RE.test(line.trim()));
  return (firstCited <= 0 ? "" : lines.slice(0, firstCited).join("\n")).trim();
}

/** Instruction block shared by the pre-search and the injected findings prompt. */
export function headlineCitationInstruction(): string {
  return [
    "When you list headlines or findings, put each on its own numbered line and end that line with",
    'SOURCE: <exact source title> — copied verbatim from the supplied source list.',
    "Give exactly the number of items the user asked for, one source per item, and cite a source only if it directly supports that item.",
    "Never cite a section front, homepage or general bulletin. Never write URLs. Never use ** or markdown formatting.",
  ].join(" ");
}
