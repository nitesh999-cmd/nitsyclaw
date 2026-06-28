import { describe, expect, it, vi } from "vitest";
import { parseEntityJson, runAutoEntityExtraction } from "../src/features/30-auto-extract.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";
import { hashPhone } from "../src/utils/crypto.js";
import type { LlmClient } from "../src/agent/deps.js";

const PHONE = "+61430008008";
const OWNER_HASH = hashPhone(PHONE);

describe("Feature 30 — parseEntityJson", () => {
  it("parses a clean JSON array of entities", () => {
    const out = parseEntityJson('[{"kind":"person","value":"Sarah"},{"kind":"org","value":"Wattage"}]');
    expect(out).toEqual([
      { kind: "person", value: "Sarah" },
      { kind: "org", value: "Wattage" },
    ]);
  });

  it("tolerates a code-fence wrapper", () => {
    const out = parseEntityJson('```json\n[{"kind":"date","value":"July 15"}]\n```');
    expect(out).toEqual([{ kind: "date", value: "July 15" }]);
  });

  it("drops items with invalid kind", () => {
    const out = parseEntityJson('[{"kind":"alien","value":"X"},{"kind":"person","value":"Y"}]');
    expect(out).toEqual([{ kind: "person", value: "Y" }]);
  });

  it("returns empty on non-JSON", () => {
    expect(parseEntityJson("hi how are you")).toEqual([]);
  });

  it("returns empty on non-array JSON", () => {
    expect(parseEntityJson('{"kind":"person","value":"X"}')).toEqual([]);
  });

  it("caps at 10 entities", () => {
    const items = Array.from({ length: 20 }, (_, i) => `{"kind":"topic","value":"t${i}"}`).join(",");
    const out = parseEntityJson(`[${items}]`);
    expect(out).toHaveLength(10);
  });

  it("drops items whose value is empty or >500 chars", () => {
    const big = "x".repeat(600);
    const out = parseEntityJson(`[{"kind":"topic","value":""},{"kind":"topic","value":"ok"},{"kind":"topic","value":"${big}"}]`);
    expect(out).toEqual([{ kind: "topic", value: "ok" }]);
  });
});

describe("Feature 30 — runAutoEntityExtraction", () => {
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

  it("returns zero counters when no recent messages", async () => {
    const { db } = makeFakeDb();
    const llm = mockLlm("[]");
    const out = await runAutoEntityExtraction(db, llm, PHONE);
    expect(out).toEqual({ scanned: 0, extracted: 0, entitiesWritten: 0 });
  });

  it("extracts entities from a recent message and writes them tagged to source", async () => {
    const { db, state } = makeFakeDb();
    state.messages.push({
      id: "msg-1",
      direction: "in",
      surface: "whatsapp",
      fromNumber: OWNER_HASH,
      body: "Sarah at Wattage owes $4250",
      transcript: null,
      createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago
    });
    const llm = mockLlm(
      '[{"kind":"person","value":"Sarah"},{"kind":"org","value":"Wattage"},{"kind":"money","value":"$4250"}]',
    );
    const out = await runAutoEntityExtraction(db, llm, PHONE, { perTickLimit: 5 });
    expect(out.scanned).toBe(1);
    expect(out.extracted).toBe(1);
    expect(out.entitiesWritten).toBe(3);
    const writtenEntities = state.entities;
    expect(writtenEntities).toHaveLength(3);
    expect(writtenEntities.every((e) => e.sourceTable === "messages" && e.sourceId === "msg-1")).toBe(
      true,
    );
  });

  it("writes a sentinel entity when LLM returns empty, to skip on next tick", async () => {
    const { db, state } = makeFakeDb();
    state.messages.push({
      id: "msg-empty",
      direction: "in",
      surface: "whatsapp",
      fromNumber: OWNER_HASH,
      body: "ok",
      transcript: null,
      createdAt: new Date(Date.now() - 60 * 1000),
    });
    const llm = mockLlm("[]");
    const out = await runAutoEntityExtraction(db, llm, PHONE);
    expect(out.extracted).toBe(1);
    expect(out.entitiesWritten).toBe(1);
    expect(state.entities[0]?.value).toMatch(/__none__/);
  });

  it("ignores messages from other senders (single-owner mode)", async () => {
    const { db, state } = makeFakeDb();
    state.messages.push({
      id: "msg-other",
      direction: "in",
      surface: "whatsapp",
      fromNumber: "different-hash",
      body: "Whatever",
      transcript: null,
      createdAt: new Date(Date.now() - 60 * 1000),
    });
    const llm = mockLlm('[{"kind":"person","value":"X"}]');
    const out = await runAutoEntityExtraction(db, llm, PHONE);
    expect(out.scanned).toBe(0);
  });
});
