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
import type { DB } from "../src/db/client.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";

export type FakeDbRow = Record<string, unknown>;

/**
 * In-memory mini-DB. We deliberately avoid spinning Postgres for unit tests.
 * Integration tests that need real SQL use pg-mem (added in tests that need it).
 */
export interface FakeDbState {
  messages: FakeDbRow[];
  memories: FakeDbRow[];
  reminders: FakeDbRow[];
  expenses: FakeDbRow[];
  briefs: FakeDbRow[];
  confirmations: FakeDbRow[];
  auditLog: FakeDbRow[];
  audit_log: FakeDbRow[];
  feature_requests: FakeDbRow[];
  profile_context: FakeDbRow[];
  connected_accounts: FakeDbRow[];
  system_heartbeats: FakeDbRow[];
  command_jobs: FakeDbRow[];
}

export type FakeDbWithState = DB & { __state: FakeDbState };

type FakeConflictTarget = { name?: string };
type FakeConflictUpdate = { target: FakeConflictTarget; set: FakeDbRow };
type FakeReturningChain = {
  returning: () => Promise<FakeDbRow[]>;
  onConflictDoUpdate: (args: FakeConflictUpdate) => Promise<void>;
  then: (resolve: (rows: FakeDbRow[]) => unknown) => Promise<unknown>;
};
type FakeQueryChain = {
  where: (cond: unknown) => FakeQueryChain;
  orderBy: (...cols: unknown[]) => FakeQueryChain;
  limit: (n: number) => FakeQueryChain;
  then: (resolve: (rows: FakeDbRow[]) => unknown) => Promise<unknown>;
};

export function getFakeDbState(db: AgentDeps["db"]): FakeDbState {
  return (db as FakeDbWithState).__state;
}

export function makeFakeDb(): { db: FakeDbWithState; state: FakeDbState } {
  const state: FakeDbState = {
    messages: [],
    memories: [],
    reminders: [],
    expenses: [],
    briefs: [],
    confirmations: [],
    auditLog: [],
    audit_log: [],
    feature_requests: [],
    profile_context: [],
    connected_accounts: [],
    system_heartbeats: [],
    command_jobs: [],
  };
  // Reuses Drizzle's chain shape. Only what features actually call.
  const insert = (table: keyof FakeDbState) => ({
    values: (rows: FakeDbRow | FakeDbRow[]) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      const inserted = arr.map((r) => ({
        id: crypto.randomUUID(),
        createdAt: new Date(),
        ...(table === "confirmations" ? { status: "pending" } : {}),
        ...(table === "feature_requests" ? { status: "pending", type: "feature" } : {}),
        ...(table === "profile_context" ? { updatedAt: new Date() } : {}),
        ...r,
      }));
      state[table].push(...inserted);
      return {
        returning: async () => inserted,
        onConflictDoUpdate: ({ target, set }: FakeConflictUpdate) => {
          const key = target.name ?? "for_date";
          for (const row of inserted) {
            const idx = state[table].findIndex((x) => x[key] === row[key]);
            if (idx >= 0) state[table][idx] = { ...state[table][idx], ...set };
            else state[table].push(row);
          }
          return Promise.resolve();
        },
      } satisfies Omit<FakeReturningChain, "then">;
    },
  });

  const db = {
    insert: (table: unknown) => {
      const name = tableName(table);
      const baseInsert = insert(name);
      return {
        values: (rows: FakeDbRow | FakeDbRow[]) => {
          const v = baseInsert.values(rows);
          // Make the chain awaitable in addition to .returning()
          return Object.assign(v, { then: (resolve: (rows: FakeDbRow[]) => unknown) => v.returning().then(resolve) });
        },
      };
    },
    select: () => ({
      from: (table: unknown) => {
        const name = tableName(table);
        const rows = state[name];
        const chain = makeQueryChain(rows);
        return chain;
      },
    }),
    update: (table: unknown) => ({
      set: (patch: FakeDbRow) => ({
        where: (cond: unknown) => {
          const name = tableName(table);
          const updated = filterRows(state[name], cond);
          updated.forEach((r) => Object.assign(r, patch));
          return {
            returning: async () => updated,
            then: (resolve: (rows: FakeDbRow[]) => unknown) => Promise.resolve(updated).then(resolve),
          };
        },
      }),
    }),
    execute: async () => [{ source: "fake-system-claim" }],
  };
  const dbWithState = Object.assign(db, { __state: state }) as unknown as FakeDbWithState;

  return { db: dbWithState, state };
}

function tableName(table: unknown): keyof FakeDbState {
  // Drizzle table objects expose `_` symbol metadata. We tag tables in schema.ts with names matching the keys.
  if (typeof table !== "object" || table === null) return "messages";
  const tableRecord = table as Record<PropertyKey, unknown>;
  const sym = Object.getOwnPropertySymbols(table).find((s) => String(s).includes("Symbol(drizzle:Name)"));
  if (sym) return tableRecord[sym] as keyof FakeDbState;
  // Fallback: most tables expose .name via a plain prop in test mode
  return (tableRecord.name as keyof FakeDbState | undefined) ?? "messages";
}

function makeQueryChain(rows: FakeDbRow[]): FakeQueryChain {
  let limit = Infinity;
  let filteredRows = rows;
  const order = (_a: FakeDbRow, _b: FakeDbRow) => 0;
  const where = (cond: unknown) => {
    filteredRows = filterRows(filteredRows, cond);
    return chain;
  };
  const orderBy = (..._cols: unknown[]) => chain;
  const lim = (n: number) => {
    limit = n;
    return chain;
  };
  const chain: FakeQueryChain = {
    where,
    orderBy,
    limit: lim,
    then: (resolve: (rows: FakeDbRow[]) => unknown) => Promise.resolve(filteredRows.slice(0, limit).sort(order)).then(resolve),
  };
  return chain;
}

function filterRows(rows: FakeDbRow[], cond: unknown): FakeDbRow[] {
  const equality = readDrizzleEquality(cond);
  if (!equality) return rows;

  const camelKey = snakeToCamel(equality.columnName);
  return rows.filter((row) => row[camelKey] === equality.value || row[equality.columnName] === equality.value);
}

function readDrizzleEquality(cond: unknown): { columnName: string; value: unknown } | null {
  if (typeof cond !== "object" || cond === null) return null;
  const chunks = (cond as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return null;
  const column = chunks.find((chunk) => typeof (chunk as { name?: unknown }).name === "string") as
    | { name: string }
    | undefined;
  const param = chunks.find((chunk) => chunk?.constructor?.name === "Param") as { value?: unknown } | undefined;
  if (!column || !param) return null;
  return { columnName: column.name, value: param.value };
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
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
