// Detects messages where the owner has already asked for live web information.
//
// When this returns true the bot must search in the same turn. Asking
// "would you like me to search?" after an explicit request is the exact
// behaviour this module exists to remove.

/** Direct instructions to search. */
const EXPLICIT_SEARCH_RE =
  /\b(search (?:the )?(?:web|internet|online|net)|web search|search online|look (?:it|this|that|them) up online|google (?:it|this|that)|check online)\b/i;

/** Topics that are only answerable from live sources. */
const LIVE_TOPIC_RE =
  /\b(news|headlines?|breaking|weather|forecast|temperature|rainfall|exchange rate|share price|stock price|petrol price|fuel price|bitcoin|crypto price|market (?:open|close|update)|scores?|match result|who won|election result)\b/i;

/** Recency markers. */
const RECENCY_RE =
  /\b(today'?s?|tonight|right now|currently|current|latest|newest|this (?:morning|afternoon|evening|week|month)|so far today|happening now|up to date|recent(?:ly)?|live|breaking)\b/i;

/** Generic nouns that only mean "live info" when paired with a recency marker. */
const RECENCY_SUBJECT_RE =
  /\b(news|stor(?:y|ies)|update|updates|event|events|price|prices|rate|rates|situation|development|developments|happening|happenings)\b/i;

/**
 * Scoped to the owner's own stored data or to bot internals. These are handled by
 * existing tools and must never be diverted into a web search.
 */
const PERSONAL_SCOPE_RE =
  /\b(my|our|mine)\s+(?:\w+\s+){0,2}(reminder|reminders|calendar|diary|email|emails|inbox|mailbox|memory|memories|note|notes|expense|expenses|spending|plate|task|tasks|list|lists|message|messages|chat|photos?|files?|contacts?|playlist)\b/i;

const BOT_INTERNAL_RE =
  /\b(feature queue|morning brief|health report|self test|canary|local brain|bot status|integration status|what went wrong)\b/i;

const GMAIL_SCOPE_RE = /\b(gmail|outlook|whatsapp history|spotify)\b/i;

/**
 * True when the message is an unambiguous request for live web information.
 *
 * Deliberately conservative: it only fires on an explicit search instruction or
 * on a live-only topic, and never when the message is scoped to the owner's own
 * stored data or to bot internals.
 */
export function isExplicitLiveWebResearchRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (PERSONAL_SCOPE_RE.test(text) || BOT_INTERNAL_RE.test(text) || GMAIL_SCOPE_RE.test(text)) return false;
  if (EXPLICIT_SEARCH_RE.test(text)) return true;
  if (LIVE_TOPIC_RE.test(text)) return true;
  return RECENCY_RE.test(text) && RECENCY_SUBJECT_RE.test(text);
}
