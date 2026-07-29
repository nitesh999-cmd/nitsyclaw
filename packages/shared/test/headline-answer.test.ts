import { describe, expect, it } from "vitest";
import {
  formatHeadlineAnswerForWhatsApp,
  isGenericIndexUrl,
  parseHeadlineAnswer,
  selectCitableSources,
  toWhatsAppText,
} from "../src/search/headline-answer.js";
import { applyVerifiedSources } from "../src/search/verified-sources.js";

const ARTICLE_A = { title: "Profile News", url: "https://profile.example.com/story-a" };
const ARTICLE_B = { title: "Reuters: World", url: "https://reuters.example.com/story-b" };
const ARTICLE_C = { title: "Al Jazeera Live Desk", url: "https://aljazeera.example.net/story-c" };
const INDEX_NPR = { title: "NPR World", url: "https://npr.example.org/world" };
const INDEX_EURO = { title: "Euronews", url: "https://euronews.example.net/" };

/** Shape the prompts request from the model. */
const CITED = [
  "Here are three headlines for 29 July 2026.",
  "1. Talks resumed in Geneva SOURCE: Profile News",
  "2. Markets closed higher SOURCE: Reuters: World",
  "3. Aid convoy reached the north SOURCE: Al Jazeera Live Desk",
].join("\n");

describe("isGenericIndexUrl", () => {
  it("recognises section fronts and homepages", () => {
    for (const url of [
      "https://npr.example.org/world",
      "https://euronews.example.net/",
      "https://x.example.com",
      "https://x.example.com/news",
      "https://x.example.com/latest/",
      "https://x.example.com/breaking",
    ]) {
      expect(isGenericIndexUrl(url), url).toBe(true);
    }
  });

  it("does not treat a real article as an index", () => {
    for (const url of [
      "https://profile.example.com/story-a",
      "https://npr.example.org/world/2026/07/29/geneva-talks",
      "https://x.example.com/news?id=7",
    ]) {
      expect(isGenericIndexUrl(url), url).toBe(false);
    }
  });
});

describe("selectCitableSources", () => {
  it("rejects a generic index page when a direct supporting article is available", () => {
    const citable = selectCitableSources([INDEX_NPR, ARTICLE_A, INDEX_EURO, ARTICLE_B]);

    expect(citable).toEqual([ARTICLE_A, ARTICLE_B]);
  });

  it("keeps index pages when nothing better exists, rather than offering nothing", () => {
    expect(selectCitableSources([INDEX_NPR, INDEX_EURO])).toEqual([INDEX_NPR, INDEX_EURO]);
  });
});

describe("parseHeadlineAnswer", () => {
  it("binds each headline to the source it cited", () => {
    const answer = parseHeadlineAnswer(CITED, [ARTICLE_A, ARTICLE_B, ARTICLE_C]);

    expect(answer.items).toEqual([
      { headline: "Talks resumed in Geneva", source: ARTICLE_A },
      { headline: "Markets closed higher", source: ARTICLE_B },
      { headline: "Aid convoy reached the north", source: ARTICLE_C },
    ]);
    expect(answer.unmatched).toBe(0);
  });

  it("drops a citation that matches no verified source", () => {
    const answer = parseHeadlineAnswer(
      "1. Invented item SOURCE: A Publication That Was Not Searched",
      [ARTICLE_A],
    );

    expect(answer.items).toEqual([]);
    expect(answer.unmatched).toBe(1);
  });

  it("never binds a headline to a generic index when articles exist", () => {
    const answer = parseHeadlineAnswer("1. Something happened SOURCE: NPR World", [INDEX_NPR, ARTICLE_A]);

    expect(answer.items).toEqual([]);
    expect(answer.unmatched).toBe(1);
  });

  it("ignores prose lines that carry no citation", () => {
    const answer = parseHeadlineAnswer("Some preamble.\n1. Real item SOURCE: Profile News\nTrailing note.", [ARTICLE_A]);

    expect(answer.items).toHaveLength(1);
  });
});

describe("toWhatsAppText", () => {
  it("converts markdown bold to WhatsApp bold and leaves no literal asterisk pairs", () => {
    expect(toWhatsAppText("**Headline** and ***strong***")).toBe("*Headline* and *strong*");
    expect(toWhatsAppText("stray ** left over")).toBe("stray  left over");
    expect(toWhatsAppText("__under__")).toBe("_under_");
  });
});

describe("applyVerifiedSources with cited headlines", () => {
  it("delivers exactly the cited headline/source relationships and nothing else", () => {
    const delivered = applyVerifiedSources(CITED, [ARTICLE_A, ARTICLE_B, ARTICLE_C, INDEX_NPR, INDEX_EURO]);

    // Three headlines, three sources, three URLs — the unused fourth and fifth
    // sources are never appended.
    expect(delivered.match(/https:\/\//g)).toHaveLength(3);
    expect(delivered).not.toContain("npr.example.org");
    expect(delivered).not.toContain("euronews.example.net");
    expect(delivered).not.toContain("Sources:");

    const blocks = delivered.split("\n\n");
    expect(blocks[0]).toBe("Here are three headlines for 29 July 2026.");
    expect(blocks.slice(1)).toEqual([
      "1. Talks resumed in Geneva\nProfile News\nhttps://profile.example.com/story-a",
      "2. Markets closed higher\nReuters: World\nhttps://reuters.example.com/story-b",
      "3. Aid convoy reached the north\nAl Jazeera Live Desk\nhttps://aljazeera.example.net/story-c",
    ]);
  });

  it("pairs every delivered URL with the source that supports its own headline", () => {
    const delivered = applyVerifiedSources(CITED, [ARTICLE_A, ARTICLE_B, ARTICLE_C]);

    for (const [headline, source] of [
      ["Talks resumed in Geneva", ARTICLE_A],
      ["Markets closed higher", ARTICLE_B],
      ["Aid convoy reached the north", ARTICLE_C],
    ] as const) {
      const block = delivered.split("\n\n").find((b) => b.includes(headline))!;
      expect(block).toContain(source.title);
      expect(block).toContain(source.url);
      // and no other source's link
      for (const other of [ARTICLE_A, ARTICLE_B, ARTICLE_C].filter((s) => s !== source)) {
        expect(block).not.toContain(other.url);
      }
    }
  });

  it("strips a fabricated URL the model wrote inline", () => {
    const delivered = applyVerifiedSources(
      "1. Talks resumed (https://made-up.example.com/z) SOURCE: Profile News",
      [ARTICLE_A],
    );

    expect(delivered).not.toContain("made-up.example.com");
    expect(delivered.match(/https:\/\//g)).toHaveLength(1);
    expect(delivered).toContain(ARTICLE_A.url);
  });

  it("emits no literal ** in the WhatsApp body", () => {
    const delivered = applyVerifiedSources(
      "**Today's headlines**\n1. **Talks resumed** in Geneva SOURCE: Profile News",
      [ARTICLE_A],
    );

    expect(delivered).not.toContain("**");
    expect(delivered).toContain("*Today's headlines*");
  });

  it("falls back to prose plus the pair list when the model cited nothing", () => {
    const delivered = applyVerifiedSources("Plain summary with no citations.", [ARTICLE_A]);

    expect(delivered).toContain("Sources:");
    expect(delivered).toContain("1. Profile News");
    expect(delivered).toContain(ARTICLE_A.url);
  });

  it("leaves an ordinary reply byte-identical when nothing was verified", () => {
    const text = "Docs are at https://example.com/guide — have a look.";

    expect(applyVerifiedSources(text, [])).toBe(text);
  });
});

describe("formatHeadlineAnswerForWhatsApp", () => {
  it("renders one source directly under its own headline", () => {
    const body = formatHeadlineAnswerForWhatsApp({
      items: [{ headline: "Talks resumed", source: ARTICLE_A }],
      unmatched: 0,
    });

    expect(body).toBe("1. Talks resumed\nProfile News\nhttps://profile.example.com/story-a");
  });
});
