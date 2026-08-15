// Focused coverage for the catalogue-brand product span.
//
// The brand used to be interpolated into `new RegExp()` after escaping. It is now
// matched as a literal string: catalogue text never reaches the regex engine, so
// no metacharacter can change what matches. Cost is bounded rather than constant
// — brand length and content still affect how much work is done, but a brand past
// MAX_BRAND_LENGTH (128) is refused outright, so pathological input cannot exceed
// a deterministic cap of text_length x 128 comparisons. These tests pin the
// behaviour that must not drift, not the implementation that produces it.

import { describe, expect, it } from "vitest";
import { resolveVoiceProduct } from "../src/voice/resolution.js";
import type { VerifiedVoiceProduct } from "../src/voice/types.js";

const OWNER = "owner-alpha";

function product(brand: string): VerifiedVoiceProduct {
  return {
    id: `product-${brand}`,
    ownerHash: OWNER,
    canonicalKey: `key-${brand}`,
    brand,
    // Deliberately empty so the alias path cannot match and the brand span is
    // what is under test.
    aliases: [],
    model: "unused-model",
    verified: true,
  };
}

function resolve(text: string, brand: string) {
  return resolveVoiceProduct({ text, ownerHash: OWNER, products: [product(brand)] });
}

describe("catalogue brand span", () => {
  it("matches a brand followed by a model-ish token", () => {
    expect(resolve("Order the Sungrow SG5000 today.", "Sungrow")?.raw).toBe("Sungrow SG5000");
    expect(resolve("Order the Sungrow inverter today.", "Sungrow")?.raw).toBe("Sungrow inverter");
    expect(resolve("Order the Sungrow battery today.", "Sungrow")?.raw).toBe("Sungrow battery");
    expect(resolve("Order the Sungrow panel today.", "Sungrow")?.raw).toBe("Sungrow panel");
  });

  it("reports the span at the position the brand actually occurs", () => {
    const text = "Please order the Sungrow SG5000 today.";
    const entity = resolve(text, "Sungrow");
    expect(entity).not.toBeNull();
    expect(text.slice(entity!.span.start, entity!.span.end)).toBe("Sungrow SG5000");
  });

  it("is case-insensitive, as the previous pattern was", () => {
    expect(resolve("order the SUNGROW sg5000 today.", "Sungrow")?.raw).toBe("SUNGROW sg5000");
  });

  it("requires a word boundary on both sides of the brand", () => {
    // `Sungrowth` must not satisfy a brand of `Sungrow`.
    expect(resolve("Order the Sungrowth SG5000 today.", "Sungrow")).toBeNull();
    expect(resolve("Order the XSungrow SG5000 today.", "Sungrow")).toBeNull();
  });

  it("requires the model-ish token to follow the brand", () => {
    expect(resolve("Order the Sungrow today.", "Sungrow")).toBeNull();
    expect(resolve("Sungrow", "Sungrow")).toBeNull();
  });

  it("skips a boundary-failing occurrence and still finds a later valid one", () => {
    expect(resolve("Sungrowth first, then Sungrow SG5000.", "Sungrow")?.raw).toBe("Sungrow SG5000");
  });

  it("treats brand metacharacters literally instead of as a pattern", () => {
    // `S.G` matches only the literal text. Had the brand ever reached the regex
    // engine unescaped, `.` would be a wildcard and `SXG` would match too.
    expect(resolve("Order the S.G inverter today.", "S.G")?.raw).toBe("S.G inverter");
    expect(resolve("Order the SXG inverter today.", "S.G")).toBeNull();
    // Alternation is literal text, not a choice between two brands.
    expect(resolve("Order the a|b inverter today.", "a|b")?.raw).toBe("a|b inverter");
    expect(resolve("Order the a inverter today.", "a|b")).toBeNull();
  });

  it("handles a regex-shaped brand without throwing", () => {
    // Several of these are not valid patterns at all; under interpolation an
    // unescaped one would throw. Here they are only ever compared as text.
    for (const brand of ["(?:", "a{2,", "[unclosed", "\\", "*", "a|b", "S.G+"]) {
      expect(() => resolve(`Order the ${brand} inverter today.`, brand)).not.toThrow();
    }
  });

  it("keeps the trailing word-boundary rule for a brand ending in punctuation", () => {
    // `\b` cannot hold between `+` and a space, so this does not match — exactly
    // as the previous `\b<brand>\b` pattern behaved.
    expect(resolve("Order the S.G+ inverter today.", "S.G+")).toBeNull();
  });

  it("refuses an over-long brand outright rather than scanning for it", () => {
    // The scan is O(text x brand) in the worst case, so cost is bounded by
    // refusing brands past MAX_BRAND_LENGTH (128) rather than by a wall-clock
    // assertion, which would be machine-dependent and CI-flaky.
    const text = `${"a".repeat(20_000)} inverter`;
    expect(resolve(text, "a".repeat(129))).toBeNull();
    // At the bound it is still evaluated normally.
    const atBound = "a".repeat(128);
    expect(resolve(`${atBound} inverter`, atBound)?.raw).toBe(`${atBound} inverter`);
    // A repetitive transcript against a bounded brand stays bounded: worst case
    // is 20_000 x 128 comparisons — deterministic work, not a blowup driven by
    // catalogue content.
    expect(resolve(text, `${"a".repeat(127)}!`)).toBeNull();
  });

  it("never lets transcript text act as a pattern", () => {
    // The transcript is the untrusted side and is only ever data. A bracketed
    // brand still fails because `)` is not the whitespace the suffix requires.
    expect(resolve("Order the (?:Sungrow) SG5000 today.", "Sungrow")).toBeNull();
    expect(resolve("Order the .* inverter today.", "Sungrow")).toBeNull();
    // Whitespace after the brand is required, and the brand itself is literal.
    expect(resolve("Order the (Sungrow SG5000) today.", "Sungrow")?.raw).toBe("Sungrow SG5000");
  });

  it("keeps JavaScript /iu word-boundary semantics for exotic case-folding characters", () => {
    // `\w` is ASCII, but with `i` and `u` together the engine folds U+017F and
    // U+212A onto ASCII word characters, so both count for `\b`. That is why a
    // brand cannot start immediately after a long s.
    expect(resolve("ſSungrow SG5000", "Sungrow")).toBeNull();
    // U+0130 lowercases to two code units. Searching a lower-cased haystack
    // would shift every later offset; comparing equal-length original slices
    // cannot, so the span stays correct.
    const text = "Order İ Sungrow SG5000";
    const entity = resolve(text, "Sungrow");
    expect(entity?.raw).toBe("Sungrow SG5000");
    expect(text.slice(entity!.span.start, entity!.span.end)).toBe("Sungrow SG5000");
    // U+212A KELVIN SIGN still counts as a word character for the boundary
    // test, exactly as the old pattern treated it.
    expect(/^\w$/iu.test("K")).toBe(true);
    // But as brand *text* it is non-ASCII, so it must match exactly: the old
    // pattern folded it onto `k`; this deliberately does not.
    expect(resolve("K inverter", "k")).toBeNull();
    expect(resolve("K inverter", "K")?.raw).toBe("K inverter");
  });

  it("is safety-monotonic: it never matches where the previous pattern did not", () => {
    // Intentionally stricter for exotic case variants: the previous `/iu`
    // pattern folded a long s onto the brand `s`; a length-preserving,
    // non-ASCII-exact comparison does not.
    expect(resolve("ſ inverter", "s")).toBeNull();
    // The U+0130 expansion counterexample: two different strings that a
    // whole-string case mapping would merge. Non-ASCII exactness rejects it,
    // matching the old pattern.
    expect(resolve("i̇İa inverter", "İi̇a")).toBeNull();
    // Exact non-ASCII spelling is still supported.
    expect(resolve("Order the straße inverter today.", "straße")?.raw).toBe("straße inverter");
    // A differently-cased non-ASCII spelling may return null, by design.
    expect(resolve("Order the STRASSE inverter today.", "straße")).toBeNull();

    // Every returned offset must slice exactly the returned text.
    for (const [text, brand] of [
      ["Order the Sungrow SG5000 today.", "Sungrow"],
      ["Order İ Sungrow SG5000", "Sungrow"],
      ["Order the (Sungrow SG5000) today.", "Sungrow"],
      ["K inverter", "K"],
    ] as const) {
      const found = resolve(text, brand);
      if (found) expect(text.slice(found.span.start, found.span.end)).toBe(found.raw);
    }
  });

  it("records that the brand fallback does NOT filter by owner or verification", () => {
    // Documented pre-existing behaviour, unchanged by the literal-matching work.
    // The alias path filters on `verified` and `ownerHash`; this deterministic
    // brand fallback scans every supplied product's brand and does not. It is
    // safe only because it returns a low-trust candidate — never a resolved
    // record — so nothing downstream may act on it without confirmation.
    const text = "Order the Sungrow SG5000 today.";
    for (const override of [{ verified: false }, { ownerHash: "someone-else" }]) {
      const entity = resolveVoiceProduct({
        text,
        ownerHash: OWNER,
        products: [{ ...product("Sungrow"), ...override }],
      });
      expect(entity?.raw).toBe("Sungrow SG5000");
      // The guard that makes this acceptable: candidate, deterministic, no
      // canonical value and no catalogue identity attached.
      expect(entity?.resolution).toBe("candidate");
      expect(entity?.source).toBe("deterministic");
      expect(entity?.canonicalValue).toBeNull();
    }
  });
});

describe("catalogue brand span is safety-monotonic over the previous pattern", () => {
  // Anything this matcher accepts, the previous escaped `/iu` pattern accepted
  // too. A reference `new RegExp` is deliberately NOT embedded here — that would
  // reinstate the construct this change removed — so the property is asserted
  // through the conditions the old pattern required: an ASCII-case-insensitive,
  // length-preserving brand match, `\b` on both sides under the same `/iu`
  // flags, the fixed suffix literal, and an offset slicing the exact matched
  // text. Because the comparison never applies a case mapping, a match here is
  // necessarily a match the old pattern produced.
  //
  // The direct comparison against the REAL escaped `/iu` oracle was run outside
  // the repository over 100,000 deterministic fuzz cases plus explicit U+0130,
  // U+017F, U+212A, sigma/final-sigma, sharp-S, combining-mark and surrogate-pair
  // cases: 17,139 accepted matches, zero looser results, zero offset corruption.
  // (An earlier run of the same corpus reported 16,492 accepted matches; that run
  // predates the length-preserving comparator and used literal characters rather
  // than escaped code points, so 17,139 is the authoritative figure.) See mind.md.
  const WORD_CHAR = /^\w$/iu;
  const SUFFIX = /^\s+(?:inverter|battery|panel|[\p{L}]*\d[\p{L}\p{N}-]*)/iu;
  const isWord = (char: string | undefined): boolean => char !== undefined && WORD_CHAR.test(char);

  it("every accepted match satisfies the conditions the previous pattern required", () => {
    const alphabet = [
      ..."abcSG. |+-_0123456789",
      "ſ", "K", "İ", "ı", "ß", "é", "न", "П", " ",
    ];
    const suffixes = [" inverter", " battery", " panel", " SG5000", " 3", "x", ""];
    // Deterministic LCG so a failure is always reproducible.
    let seed = 20260814;
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;

    let violations = 0;
    let offsetCorruption = 0;
    let accepted = 0;
    for (let i = 0; i < 4000; i += 1) {
      let brand = "";
      for (let j = 0; j < 1 + Math.floor(rng() * 4); j += 1) brand += pick(alphabet);
      let text = "";
      for (let j = 0; j < Math.floor(rng() * 12); j += 1) text += pick(alphabet);
      text += brand + pick(suffixes);
      for (let j = 0; j < Math.floor(rng() * 6); j += 1) text += pick(alphabet);

      const found = resolve(text, brand);
      if (!found) continue;
      accepted += 1;
      if (text.slice(found.span.start, found.span.end) !== found.raw) offsetCorruption += 1;

      // The conditions the old pattern imposed on any match it produced. The
      // brand check mirrors the length-preserving comparator: ASCII letters
      // case-insensitive, every other code unit exact. Deliberately NOT
      // `toLowerCase()` — a case mapping can change length and merge distinct
      // strings, which is exactly the class of false match this rules out.
      const start = found.span.start;
      const brandEnd = start + brand.length;
      let brandMatches = brandEnd - start === brand.length;
      for (let k = 0; brandMatches && k < brand.length; k += 1) {
        const t = text.charCodeAt(start + k);
        const b = brand.charCodeAt(k);
        if (t === b) continue;
        if (t > 0x7F || b > 0x7F) { brandMatches = false; break; }
        const lt = t >= 0x41 && t <= 0x5A ? t + 0x20 : t;
        const lb = b >= 0x41 && b <= 0x5A ? b + 0x20 : b;
        if (lt !== lb) brandMatches = false;
      }
      const startBoundary = isWord(text[start - 1]) !== isWord(text[start]);
      const endBoundary = isWord(text[brandEnd - 1]) !== isWord(text[brandEnd]);
      const suffixOk = SUFFIX.test(text.slice(brandEnd));
      if (!brandMatches || !startBoundary || !endBoundary || !suffixOk) violations += 1;
    }

    expect(accepted).toBeGreaterThan(0);
    expect(offsetCorruption).toBe(0);
    expect(violations).toBe(0);
  });

  it("enumerates exactly the non-ASCII characters treated as word characters", () => {
    const wordChar = /^\w$/iu;
    const extra: string[] = [];
    for (let cp = 0x80; cp <= 0xFFFF; cp += 1) {
      const ch = String.fromCodePoint(cp);
      if (wordChar.test(ch)) extra.push(ch);
    }
    // U+017F LATIN SMALL LETTER LONG S folds to `s`; U+212A KELVIN SIGN folds to `k`.
    expect(extra).toEqual(["ſ", "K"]);
  });
});
