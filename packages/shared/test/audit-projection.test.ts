import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgent } from "../src/agent/loop.js";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerWebResearch } from "../src/features/08-web-research.js";
import { makeAgentDeps, makeFakeLiveResearcher } from "./helpers.js";
import { createVerifiedSourceCollector } from "../src/search/verified-sources.js";
import type { AgentDeps } from "../src/agent/deps.js";
import type { LiveWebResearchClaim } from "../src/search/types.js";

const CITATION = {
  title: "Profile News",
  url: "https://profile.example.com/story-a",
  citedText: "Talks resumed in Geneva on Tuesday.",
};
const CLAIMS: LiveWebResearchClaim[] = [{ text: "Talks resumed in Geneva.", citations: [CITATION] }];

/** Forbidden substrings that must never reach audit_log. */
const FORBIDDEN = [
  "http", "Talks resumed", "Geneva on Tuesday", "Profile News", "profile.example.com",
  "world news today", "+61430008008", "12345@lid", "req_abc123", "ENCRYPTED-BLOB", "sk-ant-secret",
];

function llmCalling(name: string, input: Record<string, unknown>) {
  let called = false;
  return {
    async complete() { return { text: "ok" }; },
    async toolStep() {
      if (called) return { stopReason: "end_turn" as const, toolCalls: [], text: "done" };
      called = true;
      return { stopReason: "tool_use" as const, toolCalls: [{ id: "c1", name, input }], text: "" };
    },
  };
}

async function runWith(registry: ToolRegistry, deps: AgentDeps, name: string, input: Record<string, unknown>) {
  const result = await runAgent({
    userPhone: "+61400000000",
    userMessage: "Give me three verified world news headlines from today, with sources.",
    systemPrompt: "test",
    registry,
    deps: { ...deps, llm: llmCalling(name, input) },
  });
  const rows = (deps.db as { __state: { audit_log: Array<Record<string, unknown>> } }).__state.audit_log;
  return { result, rows };
}

describe("web_research runtime vs audit", () => {
  function setup() {
    const registry = new ToolRegistry();
    registerWebResearch(registry);
    const deps = makeAgentDeps({
      // The router creates one collector per turn; mirror that here.
      verifiedSources: createVerifiedSourceCollector(),
      liveResearch: makeFakeLiveResearcher({
        status: "ok",
        answer: "Talks resumed in Geneva.",
        sources: [{ title: CITATION.title, url: CITATION.url }],
        claims: CLAIMS,
        searchesUsed: 1,
      }),
    });
    return { registry, deps };
  }

  it("returns the complete result — answer, sources, claims and citations — to the agent", async () => {
    const { registry, deps } = setup();

    const { result } = await runWith(registry, deps, "web_research", { query: "world news today" });

    const out = result.toolCalls[0]!.output as {
      answer: string;
      sources: Array<{ title: string; url: string }>;
      available: boolean;
    };
    expect(out.available).toBe(true);
    expect(out.answer).toBe("Talks resumed in Geneva.");
    expect(out.sources).toEqual([{ title: CITATION.title, url: CITATION.url }]);
    // The collector received the native claims and their citations.
    expect(deps.verifiedSources?.claims()).toEqual(CLAIMS);
    expect(deps.verifiedSources?.claims()[0]!.citations[0]!.citedText).toBe(CITATION.citedText);
  });

  it("persists only the approved scalar keys, with an empty input", async () => {
    const { registry, deps } = setup();

    const { rows } = await runWith(registry, deps, "web_research", { query: "world news today" });

    const row = rows.find((r) => r.tool === "web_research")!;
    expect(Object.keys(row.output as object).sort()).toEqual([
      "answerLen", "available", "failureCode", "searchesUsed", "sourceCount", "status",
    ]);
    expect(row.output).toMatchObject({
      status: "ok", available: true, searchesUsed: 1, sourceCount: 1, answerLen: 24, failureCode: null,
    });
    expect(row.input).toEqual({});
  });

  it("writes no forbidden content anywhere in the research turn's audit rows", async () => {
    const { registry, deps } = setup();

    const { rows } = await runWith(registry, deps, "web_research", { query: "world news today" });

    const serialized = JSON.stringify(rows);
    for (const needle of FORBIDDEN) {
      expect(serialized, needle).not.toContain(needle);
    }
  });
});

describe("default audit projection", () => {
  it("cannot leak a hostile tool output containing URLs, prose, identifiers, nesting or credentials", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "hostile_tool",
      description: "returns everything it should not",
      inputSchema: z.object({ query: z.string() }),
      handler: async () => ({
        prose: "Talks resumed in Geneva on Tuesday.",
        url: "https://profile.example.com/story-a",
        owner: "+61430008008",
        lid: "12345@lid",
        requestId: "req_abc123",
        encrypted: "ENCRYPTED-BLOB",
        credential: "sk-ant-secret",
        nested: [{ deep: [{ deeper: { url: "https://profile.example.com/story-a" } }] }],
      }),
    });
    const deps = makeAgentDeps();

    const { result, rows } = await runWith(registry, deps, "hostile_tool", { query: "world news today" });

    // Runtime output is untouched — the agent still sees everything.
    expect((result.toolCalls[0]!.output as { credential: string }).credential).toBe("sk-ant-secret");

    const row = rows.find((r) => r.tool === "hostile_tool")!;
    expect(row.input).toEqual({});
    expect(row.output).toEqual({});
    const serialized = JSON.stringify(rows);
    for (const needle of FORBIDDEN) {
      expect(serialized, needle).not.toContain(needle);
    }
  });

  it("records nothing for an unknown tool", async () => {
    const deps = makeAgentDeps();

    const { rows } = await runWith(new ToolRegistry(), deps, "no_such_tool", { query: "world news today" });

    expect(rows[0]!.input).toEqual({});
    expect(JSON.stringify(rows)).not.toContain("world news today");
  });

  it("records nothing when a tool's own projection throws", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "broken_projection",
      description: "projection throws",
      inputSchema: z.object({ query: z.string() }),
      handler: async () => ({ url: "https://profile.example.com/story-a" }),
      auditProjection: () => { throw new Error("boom"); },
    });
    const deps = makeAgentDeps();

    const { rows } = await runWith(registry, deps, "broken_projection", { query: "world news today" });

    const row = rows.find((r) => r.tool === "broken_projection")!;
    expect(row.input).toEqual({});
    expect(row.output).toEqual({});
    expect(JSON.stringify(rows)).not.toContain("profile.example.com");
  });
});

describe("explicit safe projection", () => {
  it("records exactly the metadata a tool declares and nothing else", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "safe_tool",
      description: "declares a safe projection",
      inputSchema: z.object({ query: z.string() }),
      handler: async () => ({ secretBody: "Talks resumed in Geneva.", itemCount: 3 }),
      auditProjection: ({ output }) => ({
        input: {},
        output: { itemCount: (output as { itemCount: number }).itemCount },
      }),
    });
    const deps = makeAgentDeps();

    const { rows } = await runWith(registry, deps, "safe_tool", { query: "world news today" });

    const row = rows.find((r) => r.tool === "safe_tool")!;
    expect(row.output).toEqual({ itemCount: 3 });
    expect(row.input).toEqual({});
    expect(JSON.stringify(rows)).not.toContain("Talks resumed");
  });
});
