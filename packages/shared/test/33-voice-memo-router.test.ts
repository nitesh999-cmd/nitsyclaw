import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import {
  parseRouteJson,
  registerVoiceMemoRouter,
} from "../src/features/33-voice-memo-router.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";
import type { LlmClient } from "../src/agent/deps.js";
import type { ToolContext } from "../src/agent/tools.js";

const NOW = new Date("2026-06-26T08:00:00.000Z");
const PHONE = "+61430008008";

function mockLlm(responseText: string): LlmClient {
  return {
    async complete() {
      return { text: responseText };
    },
    async toolStep() {
      return { stopReason: "end_turn", toolCalls: [], text: "" };
    },
  };
}

function setup(llmResponse: string) {
  const { db, state } = makeFakeDb();
  const deps = makeAgentDeps({
    db,
    llm: mockLlm(llmResponse),
    now: () => NOW,
    timezone: "Australia/Melbourne",
  });
  const registry = new ToolRegistry();
  registerVoiceMemoRouter(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return { tool: registry.get("route_voice_memo")!, ctx, state };
}

describe("Feature 33 — parseRouteJson", () => {
  it("parses the documented shape", () => {
    const out = parseRouteJson(
      '{"reminders":[{"text":"call Mum","fireAtIso":"2026-06-27T07:00:00Z"}],"notes":["idea: ship voice routing"],"people":["Mum"],"topics":["voice routing"]}',
    );
    expect(out.reminders).toHaveLength(1);
    expect(out.reminders[0]?.text).toBe("call Mum");
    expect(out.notes).toEqual(["idea: ship voice routing"]);
    expect(out.people).toEqual(["Mum"]);
    expect(out.topics).toEqual(["voice routing"]);
  });

  it("tolerates code-fence wrapper", () => {
    const out = parseRouteJson('```json\n{"reminders":[],"notes":["x"],"people":[],"topics":[]}\n```');
    expect(out.notes).toEqual(["x"]);
  });

  it("drops reminders with invalid fireAtIso", () => {
    const out = parseRouteJson(
      '{"reminders":[{"text":"t","fireAtIso":"not-a-date"},{"text":"good","fireAtIso":"2026-06-27T07:00:00Z"}],"notes":[],"people":[],"topics":[]}',
    );
    expect(out.reminders).toHaveLength(1);
    expect(out.reminders[0]?.text).toBe("good");
  });

  it("returns empty shape on non-JSON", () => {
    const out = parseRouteJson("hello world");
    expect(out).toEqual({ reminders: [], notes: [], people: [], topics: [] });
  });

  it("caps reminders at 5, people at 8", () => {
    const reminders = Array.from({ length: 10 }, (_, i) =>
      `{"text":"r${i}","fireAtIso":"2026-06-27T07:00:00Z"}`,
    ).join(",");
    const people = Array.from({ length: 12 }, (_, i) => `"p${i}"`).join(",");
    const out = parseRouteJson(`{"reminders":[${reminders}],"notes":[],"people":[${people}],"topics":[]}`);
    expect(out.reminders).toHaveLength(5);
    expect(out.people).toHaveLength(8);
  });

  it("drops non-string people/topics", () => {
    const out = parseRouteJson('{"reminders":[],"notes":[],"people":["X",123,null,"Y"],"topics":[]}');
    expect(out.people).toEqual(["X", "Y"]);
  });
});

describe("Feature 33 — route_voice_memo tool", () => {
  it("inserts reminders + memories + entities, returns summary with counts", async () => {
    const { tool, ctx, state } = setup(
      '{"reminders":[{"text":"call Mum 7pm","fireAtIso":"2026-06-27T09:00:00Z"}],"notes":["idea: ship voice routing"],"people":["Mum","Sarah"],"topics":["voice routing"]}',
    );
    const out = await tool.handler(
      { transcript: "Note: ship voice routing today. Call Mum tomorrow 7pm. Email Sarah about Q3." },
      ctx,
    ) as {
      remindersCreated: string[];
      noteIds: string[];
      entitiesCreated: number;
      summary: string;
    };
    expect(out.remindersCreated).toHaveLength(1);
    expect(out.noteIds).toHaveLength(1);
    expect(out.entitiesCreated).toBe(3); // 2 people + 1 topic
    expect(state.reminders).toHaveLength(1);
    expect(state.memories).toHaveLength(1);
    expect(state.entities).toHaveLength(3);
    expect(out.summary).toMatch(/1 reminder/);
    expect(out.summary).toMatch(/2 person/);
  });

  it("returns 'nothing actionable' summary when LLM extracts empty", async () => {
    const { tool, ctx, state } = setup('{"reminders":[],"notes":[],"people":[],"topics":[]}');
    const out = await tool.handler(
      { transcript: "uh hello testing one two three" },
      ctx,
    ) as { summary: string; remindersCreated: string[] };
    expect(out.summary).toMatch(/nothing actionable/i);
    expect(out.remindersCreated).toEqual([]);
    expect(state.reminders).toHaveLength(0);
  });

  it("tags entities with sourceMessageId when provided", async () => {
    const { tool, ctx, state } = setup(
      '{"reminders":[],"notes":[],"people":["Raj"],"topics":[]}',
    );
    await tool.handler(
      { transcript: "Met Raj this morning, productive chat.", sourceMessageId: "msg-xyz" },
      ctx,
    );
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0]?.sourceTable).toBe("messages");
    expect(state.entities[0]?.sourceId).toBe("msg-xyz");
  });

  it("tags memory with voice-memo tag", async () => {
    const { tool, ctx, state } = setup(
      '{"reminders":[],"notes":["thought x"],"people":[],"topics":[]}',
    );
    await tool.handler({ transcript: "thought x" }, ctx);
    expect(state.memories[0]?.tags).toContain("voice-memo");
  });
});
