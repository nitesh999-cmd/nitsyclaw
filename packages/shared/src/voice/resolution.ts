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
}): VoiceTypedEntity | null {
  const matches: Array<{ contact: VerifiedVoiceContact; span: VoiceEvidenceSpan }> = [];
  for (const contact of args.contacts) {
    if (!contact.verified || contact.ownerHash !== args.ownerHash) continue;
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
  const candidate = args.text.match(/(?:Tesla|टेस्ला)\s+[\p{L}\p{M}\p{N} -]*(?:Powerwall|पावर[\p{L}\p{M}]*)(?:\s+[\p{L}\p{M}\p{N}-]+)?/iu);
  if (candidate?.index === undefined) return null;
  return {
    id: "product-candidate",
    fieldType: "product",
    raw: candidate[0],
    span: { start: candidate.index, end: candidate.index + candidate[0].length, text: candidate[0] },
    canonicalValue: null,
    resolution: "candidate",
    source: "deterministic",
  };
}
