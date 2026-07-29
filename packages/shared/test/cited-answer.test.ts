import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { buildCitedAnswer, formatCitedAnswerForWhatsApp, parseRequestedItemCount } from "../src/search/cited-answer.js";
import { applyVerifiedSources, createVerifiedSourceCollector } from "../src/search/verified-sources.js";
import { parseWebSearchResponse, formatLiveWebResearchForWhatsApp } from "../src/search/live-web-research.js";
import type { LiveWebResearchClaim } from "../src/search/types.js";

const CITE_A = { title: "Profile News", url: "https://profile.example.com/a", citedText: "Talks resumed in Geneva." };
const CITE_B = { title: "Reuters: World", url: "https://reuters.example.com/b", citedText: "Markets closed higher." };
const CITE_C = { title: "NPR World", url: "https://npr.example.org/world", citedText: "Aid convoy reached the north." };

const CLAIMS: LiveWebResearchClaim[] = [
  { text: "Talks resumed in Geneva.", citations: [CITE_A] },
  { text: "Markets closed higher.", citations: [CITE_B] },
  { text: "An aid convoy reached the north.", citations: [CITE_C] },
];

/** A provider response with per-span citations, as the SDK types describe it. */
function providerResponse() {
  return {
    stop_reason: "end_turn",
    content: [
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "q" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [
          { type: "web_search_result", url: CITE_A.url, title: CITE_A.title, encrypted_content: "ENC-A" },
          { type: "web_search_result", url: CITE_B.url, title: CITE_B.title, encrypted_content: "ENC-B" },
          { type: "web_search_result", url: "https://unused.example.net/x", title: "Unused Source", encrypted_content: "ENC-U" },
        ],
      },
      { type: "text", text: "Here are the headlines.", citations: null },
      {
        type: "text",
        text: "Talks resumed in Geneva.",
        citations: [{ type: "web_search_result_location", url: CITE_A.url, title: CITE_A.title, cited_text: CITE_A.citedText, encrypted_index: "IDX-A" }],
      },
      {
        type: "text",
        text: "Markets closed higher.",
        citations: [{ type: "web_search_result_location", url: CITE_B.url, title: CITE_B.title, cited_text: CITE_B.citedText, encrypted_index: "IDX-B" }],
      },
    ],
  };
}

describe("native citation preservation", () => {
  it("keeps each provider citation attached to the span it supports", () => {
    const result = parseWebSearchResponse(providerResponse());

    expect(result.status).toBe("ok");
    expect(result.claims).toEqual([
      { text: "Talks resumed in Geneva.", citations: [CITE_A] },
      { text: "Markets closed higher.", citations: [CITE_B] },
    ]);
    // Uncited prose never becomes a deliverable claim.
    expect(result.claims.some((c) => c.text.includes("Here are the headlines"))).toBe(false);
  });

  it("never surfaces encrypted content or indices", () => {
    const serialized = JSON.stringify(parseWebSearchResponse(providerResponse()));

    expect(serialized).not.toContain("ENC-A");
    expect(serialized).not.toContain("IDX-A");
    expect(serialized).not.toContain("encrypted_index");
    expect(serialized).not.toContain("srvtoolu_1");
  });
});

describe("buildCitedAnswer", () => {
  it("delivers exactly N items when N are supported", () => {
    const answer = buildCitedAnswer(CLAIMS, 3);

    expect(answer.items).toHaveLength(3);
    expect(answer.partial).toBe(false);
  });

  it("reports honestly when fewer than N are supported", () => {
    const answer = buildCitedAnswer(CLAIMS.slice(0, 2), 3);

    expect(answer.items).toHaveLength(2);
    expect(answer.partial).toBe(true);
    expect(formatCitedAnswerForWhatsApp(answer)).toContain("verify 2 of the 3");
  });

  it("drops a claim the provider did not cite", () => {
    const answer = buildCitedAnswer([...CLAIMS, { text: "Unsupported assertion.", citations: [] }], undefined);

    expect(answer.items).toHaveLength(3);
    expect(JSON.stringify(answer)).not.toContain("Unsupported assertion");
  });
});

describe("parseRequestedItemCount", () => {
  it("reads the count from the owner's own words", () => {
    expect(parseRequestedItemCount("Give me three verified world news headlines from today, using my Melbourne date, with sources.")).toBe(3);
    expect(parseRequestedItemCount("give me 5 headlines")).toBe(5);
    expect(parseRequestedItemCount("what is the weather")).toBeUndefined();
  });
});

describe("delivery from native citations", () => {
  it("produces exactly three headline/citation units and omits the unused source", () => {
    const delivered = applyVerifiedSources("ignored model prose", [], CLAIMS, 3);
    const blocks = delivered.split("\n\n");

    expect(blocks).toEqual([
      "1. Talks resumed in Geneva.\nProfile News\nhttps://profile.example.com/a",
      "2. Markets closed higher.\nReuters: World\nhttps://reuters.example.com/b",
      "3. An aid convoy reached the north.\nNPR World\nhttps://npr.example.org/world",
    ]);
    expect(delivered).not.toContain("unused.example.net");
    expect(delivered.match(/https:\/\//g)).toHaveLength(3);
  });

  it("cannot attach a genuine source to the wrong headline", () => {
    const delivered = applyVerifiedSources("x", [], CLAIMS, 3);

    const geneva = delivered.split("\n\n").find((b) => b.includes("Geneva"))!;
    expect(geneva).toContain(CITE_A.url);
    expect(geneva).not.toContain(CITE_B.url);
    expect(geneva).not.toContain(CITE_C.url);
  });

  it("uses a generic index page when the provider cited it for that claim", () => {
    // URL shape alone must not decide relevance: NPR's section front is cited.
    const delivered = applyVerifiedSources("x", [], [CLAIMS[2]!], 1);

    expect(delivered).toContain("https://npr.example.org/world");
  });

  it("removes a fabricated URL the model wrote", () => {
    const delivered = applyVerifiedSources(
      "1. Talks resumed https://made-up.example.com/z",
      [{ title: "Profile News", url: CITE_A.url }],
      CLAIMS.slice(0, 1),
      1,
    );

    expect(delivered).not.toContain("made-up.example.com");
    expect(delivered.match(/https:\/\//g)).toHaveLength(1);
  });

  it("ignores a genuine source title the model asserts without native citation", () => {
    // The model names a real verified source, but no provider citation backs it.
    const delivered = applyVerifiedSources(
      "1. Something happened SOURCE: Profile News",
      [{ title: "Profile News", url: CITE_A.url }],
      [],
      1,
    );

    // Falls through to the pair list, which asserts no item-level support.
    expect(delivered).toContain("Sources:");
    expect(delivered).not.toContain("1. Something happened\nProfile News");
  });

  it("never returns the old flat list when native citations exist, even with no markers", () => {
    const delivered = applyVerifiedSources(
      "Plain prose with no SOURCE markers at all.",
      [{ title: "Profile News", url: CITE_A.url }],
      CLAIMS,
      3,
    );

    expect(delivered).not.toContain("Sources:");
    expect(delivered).toContain("1. Talks resumed in Geneva.");
  });

  it("falls back to the native cited result when local output is malformed", () => {
    const delivered = applyVerifiedSources("", [], CLAIMS, 3);

    expect(delivered).toContain("1. Talks resumed in Geneva.");
    expect(delivered).toContain("3. An aid convoy reached the north.");
  });

  it("emits no literal ** and keeps WhatsApp bold", () => {
    const delivered = applyVerifiedSources("x", [], [{ text: "**Bold** claim.", citations: [CITE_A] }], 1);

    expect(delivered).not.toContain("**");
    expect(delivered).toContain("*Bold* claim.");
  });

  it("leaves ordinary turns byte-identical", () => {
    const text = "Docs are at https://example.com/guide — have a look.";

    expect(applyVerifiedSources(text, [])).toBe(text);
    expect(applyVerifiedSources(text, [], [])).toBe(text);
  });
});

describe("timeout fallback path", () => {
  it("renders the same native relationships", () => {
    const body = formatLiveWebResearchForWhatsApp(
      { status: "ok", answer: "prose", sources: [], claims: CLAIMS, searchesUsed: 1 },
      3,
    );

    expect(body).toContain("1. Talks resumed in Geneva.\nProfile News\nhttps://profile.example.com/a");
    expect(body).toContain("2. Markets closed higher.\nReuters: World\nhttps://reuters.example.com/b");
    expect(body).not.toContain("Sources:");
  });
});

describe("collector carries claims", () => {
  it("records claims alongside pairs and ignores uncited ones", () => {
    const collector = createVerifiedSourceCollector();

    collector.recordClaims([...CLAIMS, { text: "no citation", citations: [] }]);

    expect(collector.claims()).toHaveLength(3);
  });
});

describe("module graph", () => {
  it("has no circular import between the search modules", () => {
    const dir = "packages/shared/src/search";
    const graph = new Map<string, string[]>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const src = readFileSync(`${dir}/${file}`, "utf8");
      const deps: string[] = [];
      for (const m of src.matchAll(/from\s+"\.\/([\w-]+)\.js"/g)) {
        // `import type` is erased at runtime and cannot form a cycle.
        const line = src.slice(0, m.index).split("\n").pop() ?? "";
        const stmtStart = src.lastIndexOf("import", m.index);
        const stmt = src.slice(stmtStart, m.index);
        if (/^import\s+type\b/.test(stmt) || /^export\s+type\b/.test(stmt) || line.includes("import type")) continue;
        deps.push(`${m[1]}.ts`);
      }
      graph.set(file, deps);
    }

    const cycles: string[] = [];
    const visit = (node: string, path: string[]): void => {
      if (path.includes(node)) { cycles.push([...path, node].join(" -> ")); return; }
      for (const dep of graph.get(node) ?? []) visit(dep, [...path, node]);
    };
    for (const node of graph.keys()) visit(node, []);

    expect(cycles).toEqual([]);
  });
});
