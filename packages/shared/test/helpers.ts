// Test helpers — fakes for every dep so features can be tested in isolation.

import { vi } from "vitest";
import type {
  AgentDeps,
  CalendarClient,
  Embedder,
  ImageAnalyzer,
  LlmClient,
  Transcriber,
  WebSearcher,
} from "../src/agent/deps.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";

/**
 * In-memory mini-DB. We deliberately avoid spinning Postgres for unit tests.
 * Integration tests that need real SQL use pg-mem (added in tests that need it).
 */
export interface FakeDbState {
  messages: any[];
  memories: any[];
  reminders: any[];
  expenses: any[];
  briefs: any[];
  confirmations: any[];
  auditLog: any[];
}

export function makeFakeDb(): { db: any; state: FakeDbState } {
  const state: FakeDbState = {
    messages: [],
    memories: [],
    reminders: [],
    expenses: [],
    briefs: [],
    confirmations: [],
    auditLog: [],
  };
  // Reuses Drizzle's chain shape. Only what features actually call.
  const insert = (table: keyof FakeDbState) => ({
    values: (rows: any | any[]) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      const inserted = arr.map((r) => ({ id: crypto.randomUUID(), createdAt: new Date(), ...r }));
      state[table].push(...inserted);
      return {
        returning: async () => inserted,
        onConflictDoUpdate: ({ target, set }: any) => {
          const key = (target as any).name ?? "for_date";
          for (const row of inserted) {
            const idx = state[table].findIndex((x: any) => x[key] === (row as any)[key]);
            if (idx >= 0) state[table][idx] = { ...state[table][idx], ...set };
            else state[table].push(row);
          }
          return Promise.resolve();
        },
      };
    },
  });

  const db: any = {
    insert: (table: any) => {
      const name = tableName(table);
      const baseInsert = insert(name);
      return {
        values: (rows: any) => {
          const v = baseInsert.values(rows);
          // Make the chain awaitable in addition to .returning()
          return Object.assign(v, { then: (r: any) => v.returning().then(r) });
        },
      };
    },
    select: () => ({
      from: (table: any) => {
        const name = tableName(table);
        const rows = state[name];
        const chain = makeQueryChain(rows);
        return chain;
      },
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: async (_cond: any) => {
          const name = tableName(table);
          state[name].forEach((r: any) => Object.assign(r, patch));
          return Promise.resolve();
        },
      }),
    }),
  };

  return { db, state };
}

function tableName(table: any): keyof FakeDbState {
  // Drizzle table objects expose `_` symbol metadata. We tag tables in schema.ts with names matching the keys.
  const sym = Object.getOwnPropertySymbols(table).find((s) => String(s).includes("Symbol(drizzle:Name)"));
  if (sym) return (table as any)[sym] as keyof FakeDbState;
  // Fallback: most tables expose .name via a plain prop in test mode
  return (table as any).name ?? "messages";
}

function makeQueryChain(rows: any[]) {
  let limit = Infinity;
  let order = (a: any, b: any) => 0;
  const where = (_cond: any) => chain;
  const orderBy = (..._cols: any[]) => chain;
  const lim = (n: number) => {
    limit = n;
    return chain;
  };
  const chain: any = {
    where,
    orderBy,
    limit: lim,
    then: (resolve: any) => Promise.resolve(rows.slice(0, limit).sort(order)).then(resolve),
  };
  return chain;
}

// === Fake adapters ===

export const fakeLlm: LlmClient = {
  async complete({ messages }) {
    return { text: `[fake-llm reply to: ${messages.at(-1)?.content?.slice(0, 40)}]` };
  },
  async toolStep() {
    return { stopReason: "end_turn", toolCalls: [], text: "[fake-llm done]" };
  },
};

export function fakeLlmWithToolCall(toolName: string, input: Record<string, unknown>): LlmClient {
  let called = false;
  return {
    async complete() {
      return { text: "ok" };
    },
    async toolStep() {
      if (called) return { stopReason: "end_turn", toolCalls: [], text: "done" };
      called = true;
      return {
        stopReason: "tool_use",
        toolCalls: [{ id: "call-1", name: toolName, input }],
        text: "calling tool",
      };
    },
  };
}

export const fakeTranscriber: Transcriber = {
  async transcribe(audio: Buffer) {
    if (audio.byteLength === 0) throw new Error("empty");
    return "this is a transcribed voice note";
  },
};

export const fakeWebSearch: WebSearcher = {
  async search(q) {
    return [
      { title: `result for ${q}`, url: "https://x.com/1", snippet: "snippet 1" },
      { title: `result 2 for ${q}`, url: "https://x.com/2", snippet: "snippet 2" },
    ];
  },
};

export const fakeCalendar: CalendarClient = {
  async suggestSlots({ window }) {
    return [new Date(window.start.getTime() + 60 * 60 * 1000)];
  },
  async createEvent({ start }) {
    return { id: `ev-${start.toISOString()}`, htmlLink: "https://cal/x" };
  },
};

export const fakeImageAnalyzer: ImageAnalyzer = {
  async extractReceipt() {
    return {
      amount: 250,
      currency: "INR",
      merchant: "Starbucks",
      date: new Date("2026-04-25T10:00:00Z"),
      rawText: "Starbucks coffee 250 INR",
    };
  },
};

export const fakeEmbedder: Embedder = {
  async embed() {
    return new Array(1536).fill(0);
  },
};

export function makeAgentDeps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  const wa = new MockWhatsAppClient();
  const { db } = makeFakeDb();
  return {
    db,
    whatsapp: wa,
    llm: fakeLlm,
    transcriber: fakeTranscriber,
    webSearch: fakeWebSearch,
    calendar: fakeCalendar,
    imageAnalyzer: fakeImageAnalyzer,
    embedder: fakeEmbedder,
    now: () => new Date("2026-04-25T08:00:00Z"),
    timezone: "Asia/Kolkata",
    ...overrides,
  };
}

export { vi };
