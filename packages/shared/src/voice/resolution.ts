import type {
  VerifiedVoiceContact,
  VerifiedVoiceProduct,
  VoiceEvidenceSpan,
  VoiceTypedEntity,
} from "./types.js";

function normalizeAlias(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en").trim();
}

function boundary(char: string | undefined): boolean {
  return char === undefined || !/[\p{L}\p{M}\p{N}_]/u.test(char);
}

/**
 * The model-ish token that must follow a catalogue brand for it to count as a
 * product mention. A literal, so no catalogue or transcript text is ever
 * compiled into a pattern.
 */
const BRAND_MODEL_SUFFIX = /^\s+(?:inverter|battery|panel|[\p{L}]*\d[\p{L}\p{N}-]*)/iu;

/**
 * Whether `\b` would treat this character as a word character, under the exact
 * flags the previous pattern used.
 *
 * `\w` is ASCII, but with `i` *and* `u` together the engine applies Unicode
 * simple case folding, so a few non-ASCII characters fold onto an ASCII word
 * character and count: U+017F LATIN SMALL LETTER LONG S folds to `s`, and
 * U+212A KELVIN SIGN folds to `k`. Testing with the same `/iu` flags reproduces
 * that instead of approximating it — which is what keeps `ſSungrow` from
 * matching the brand `Sungrow`, exactly as the old pattern did.
 */
const REGEXP_WORD_CHAR = /^\w$/iu;

function isRegExpWordChar(char: string | undefined): boolean {
  return char !== undefined && REGEXP_WORD_CHAR.test(char);
}

/**
 * Compares one code unit of the transcript against one of the brand.
 *
 * ASCII letters compare case-insensitively; every other code unit must be
 * exactly equal. No case mapping is applied, because case mapping is not
 * length-preserving — `"İ".toLowerCase()` is two code units — and a
 * length change is what lets two different strings collapse onto one another
 * and produce a match the previous pattern would have refused.
 */
function codeUnitsMatch(textUnit: number, brandUnit: number): boolean {
  if (textUnit === brandUnit) return true;
  if (textUnit > 0x7F || brandUnit > 0x7F) return false;
  const lowerText = textUnit >= 0x41 && textUnit <= 0x5A ? textUnit + 0x20 : textUnit;
  const lowerBrand = brandUnit >= 0x41 && brandUnit <= 0x5A ? brandUnit + 0x20 : brandUnit;
  return lowerText === lowerBrand;
}

/**
 * Finds `brand` followed by a model-ish token.
 *
 * Length-preserving, safety-monotonic brand matching: ASCII case-insensitive;
 * non-ASCII exact. May reject exotic Unicode case variants but cannot introduce
 * a match rejected by the previous escaped `/iu` implementation. Comparison is
 * code unit by code unit over equal-length windows, so no whole-string
 * transformation can shift an offset or merge two distinct strings. Word
 * boundaries remain exactly the old ones, tested with the same `/iu` flags.
 *
 * The brand is matched as a literal rather than escaped and compiled, so
 * catalogue text never reaches the regex engine and no metacharacter can change
 * what matches. Only the fixed suffix above is a regex.
 *
 * Cost is bounded rather than unconditionally cheap. The scan is O(text x brand)
 * in the worst case — a highly repetitive transcript against a highly repetitive
 * brand — so a brand longer than `MAX_BRAND_LENGTH` is refused outright instead
 * of scanned. A catalogue brand is owner-curated and short; anything past that
 * bound is not a real product name, and refusing it keeps a single turn from
 * blocking the event loop. That bound also makes the cost ceiling deterministic
 * rather than machine-dependent.
 */
const MAX_BRAND_LENGTH = 128;

function matchBrandSpan(text: string, brand: string): { index: number; text: string } | null {
  if (!brand || brand.length > MAX_BRAND_LENGTH) return null;
  for (let at = 0; at + brand.length <= text.length; at = at + 1) {
    let matched = true;
    for (let offset = 0; offset < brand.length; offset = offset + 1) {
      if (!codeUnitsMatch(text.charCodeAt(at + offset), brand.charCodeAt(offset))) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const end = at + brand.length;
    // `\b` holds where word-ness changes across the position.
    const startBoundary = isRegExpWordChar(text[at - 1]) !== isRegExpWordChar(text[at]);
    const endBoundary = isRegExpWordChar(text[end - 1]) !== isRegExpWordChar(text[end]);
    if (startBoundary && endBoundary) {
      const suffix = BRAND_MODEL_SUFFIX.exec(text.slice(end));
      if (suffix) return { index: at, text: text.slice(at, end + suffix[0].length) };
    }
  }
  return null;
}

function findAliasSpan(text: string, alias: string): VoiceEvidenceSpan | null {
  const normalizedText = text.normalize("NFC").toLocaleLowerCase("en");
  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) return null;
  const rawBoundaries = [0];
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index)!;
    index += String.fromCodePoint(codePoint).length;
    rawBoundaries.push(index);
  }
  const normalizedPrefixLengths = rawBoundaries.map((offset) =>
    text.slice(0, offset).normalize("NFC").toLocaleLowerCase("en").length,
  );
  let from = 0;
  while (from <= normalizedText.length) {
    const start = normalizedText.indexOf(normalizedAlias, from);
    if (start < 0) return null;
    const end = start + normalizedAlias.length;
    if (boundary(normalizedText[start - 1]) && boundary(normalizedText[end])) {
      const rawStartIndex = normalizedPrefixLengths.findIndex((length) => length === start);
      let rawEndIndex = -1;
      for (let index = normalizedPrefixLengths.length - 1; index >= 0; index--) {
        if (normalizedPrefixLengths[index] === end) {
          rawEndIndex = index;
          break;
        }
      }
      if (rawStartIndex >= 0 && rawEndIndex >= rawStartIndex) {
        const rawStart = rawBoundaries[rawStartIndex]!;
        const rawEnd = rawBoundaries[rawEndIndex]!;
        return { start: rawStart, end: rawEnd, text: text.slice(rawStart, rawEnd) };
      }
    }
    from = start + 1;
  }
  return null;
}

function recipientCandidate(text: string): VoiceEvidenceSpan | null {
  const devanagari = text.match(/([\p{L}\p{M}]+)\s+को(?:\s|$)/u);
  if (devanagari?.index !== undefined) {
    const raw = devanagari[1]!;
    const start = devanagari.index + devanagari[0].indexOf(raw);
    return { start, end: start + raw.length, text: raw };
  }
  const english = text.match(/\b(?:call|phone|message|text|send\s+(?:a\s+)?message\s+to)\s+([\p{L}\p{M}'’-]+(?:\s+[\p{L}\p{M}'’-]+){0,2})/iu);
  if (english?.index === undefined) return null;
  const words = english[1]!.split(/\s+/u);
  const stop = new Set(["in", "at", "on", "now", "today", "tomorrow", "about", "with", "for"]);
  const retained: string[] = [];
  for (const word of words) {
    if (stop.has(word.toLowerCase())) break;
    retained.push(word);
  }
  const raw = retained.join(" ") || words[0]!;
  const start = english.index + english[0].indexOf(english[1]!);
  return { start, end: start + raw.length, text: text.slice(start, start + raw.length) };
}

export function resolveVoiceRecipient(args: {
  text: string;
  ownerHash: string;
  contacts: VerifiedVoiceContact[];
  requiredChannel?: VerifiedVoiceContact["channel"];
}): VoiceTypedEntity | null {
  const matches: Array<{ contact: VerifiedVoiceContact; span: VoiceEvidenceSpan }> = [];
  for (const contact of args.contacts) {
    if (!contact.verified || contact.ownerHash !== args.ownerHash || (args.requiredChannel && contact.channel !== args.requiredChannel)) continue;
    for (const alias of contact.aliases) {
      const aliasSpan = findAliasSpan(args.text, alias);
      if (aliasSpan) {
        matches.push({ contact, span: aliasSpan });
        break;
      }
    }
  }
  if (matches.length === 1) {
    const match = matches[0]!;
    return {
      id: "recipient-verified",
      fieldType: "recipient",
      raw: match.span.text,
      span: match.span,
      canonicalValue: match.contact.displayName,
      resolution: "exact",
      source: "verified_contact",
      recordId: match.contact.id,
    };
  }
  if (matches.length > 1) {
    const first = matches[0]!;
    return {
      id: "recipient-ambiguous",
      fieldType: "recipient",
      raw: first.span.text,
      span: first.span,
      canonicalValue: null,
      resolution: "ambiguous",
      source: "verified_contact",
      alternatives: matches.map(({ contact }) => `${contact.displayName} (${contact.maskedDestination})`),
    };
  }
  const candidate = recipientCandidate(args.text);
  if (!candidate) return null;
  return {
    id: "recipient-candidate",
    fieldType: "recipient",
    raw: candidate.text,
    span: candidate,
    canonicalValue: null,
    resolution: "candidate",
    source: "deterministic",
  };
}

export function resolveVoiceProduct(args: {
  text: string;
  ownerHash: string;
  products: VerifiedVoiceProduct[];
}): VoiceTypedEntity | null {
  const matches: Array<{ product: VerifiedVoiceProduct; span: VoiceEvidenceSpan }> = [];
  for (const product of args.products) {
    if (!product.verified || product.ownerHash !== args.ownerHash) continue;
    for (const alias of product.aliases) {
      const aliasSpan = findAliasSpan(args.text, alias);
      if (aliasSpan) {
        matches.push({ product, span: aliasSpan });
        break;
      }
    }
  }
  if (matches.length === 1) {
    const match = matches[0]!;
    return {
      id: "product-verified",
      fieldType: "product",
      raw: match.span.text,
      span: match.span,
      canonicalValue: match.product.canonicalKey,
      resolution: "exact",
      source: "verified_product",
      recordId: match.product.id,
    };
  }
  if (matches.length > 1) {
    const first = matches[0]!;
    return {
      id: "product-ambiguous",
      fieldType: "product",
      raw: first.span.text,
      span: first.span,
      canonicalValue: null,
      resolution: "ambiguous",
      source: "verified_product",
      alternatives: matches.map(({ product }) => `${product.brand} ${product.model}`),
    };
  }
  const knownBrand = args.products
    .map(({ brand }) => matchBrandSpan(args.text, brand))
    .find((candidate) => candidate?.index !== undefined);
  const specificCandidate = args.text.match(/(?:Tesla|टेस्ला)\s+[\p{L}\p{M}\p{N} -]*(?:Powerwall|पावर[\p{L}\p{M}]*)(?:\s+[\p{L}\p{M}\p{N}-]+)?/iu);
  const candidate = specificCandidate?.index === undefined
    ? knownBrand?.index === undefined
      ? null
      : { start: knownBrand.index, end: knownBrand.index + knownBrand.text.length, text: knownBrand.text }
    : { start: specificCandidate.index, end: specificCandidate.index + specificCandidate[0].length, text: specificCandidate[0] };
  if (!candidate) return null;
  return {
    id: "product-candidate",
    fieldType: "product",
    raw: candidate.text,
    span: candidate,
    canonicalValue: null,
    resolution: "candidate",
    source: "deterministic",
  };
}
