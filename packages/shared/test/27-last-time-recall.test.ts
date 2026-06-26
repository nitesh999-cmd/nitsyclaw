import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerLastTimeRecall } from "../src/features/27-last-time-recall.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";
import { hashPhone } from "../src/utils/crypto.js";
import type { ToolContext } from "../src/agent/tools.js";

const NOW = new Date("2026-06-26T08:00:00.000Z");
const PHONE = "+61430008008";
const OWNER_HASH = hashPhone(PHONE);

function setup() {
  const { db, state } = makeFakeDb();
  const deps = makeAgentDeps({
    db,
    now: () => NOW,
    timezone: "Australia/Melbourne",
  });
  const registry = new ToolRegistry();
  registerLastTimeRecall(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return { tool: registry.get("last_time_recall")!, ctx, state };
}

describe("Feature 27 — last-time recall (cross-table)", () => {
  // NOTE: the fake DB does NOT implement ILIKE — it ignores the where clause
  // for raw sql. So these tests verify the tool wiring and result shape;
  // real ILIKE matching is tested implicitly via the full bot scheduler.

  it("returns count: 0 when no rows in any table", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler({ query: "anything" }, ctx) as {
      count: number;
      items: unknown[];
    };
    expect(out.count).toBe(0);
    expect(out.items).toEqual([]);
  });

  it("returns hits across all four surfaces with normalised shape", async () => {
    const { tool, ctx, state } = setup();
    state.messages.push({
      id: "msg-1",
      direction: "in",
      surface: "whatsapp",
      fromNumber: OWNER_HASH,
      body: "plumber called",
      transcript: null,
      createdAt: new Date("2026-06-20T10:00:00Z"),
    });
    state.memories.push({
      id: "mem-1",
      kind: "note",
      content: "Sarah is on holiday until July",
      tags: [],
      createdAt: new Date("2026-06-22T10:00:00Z"),
    });
    state.expenses.push({
      id: "exp-1",
      amount: 12550,
      currency: "AUD",
      category: "groceries",
      merchant: "Woolworths",
      occurredAt: new Date("2026-06-24T10:00:00Z"),
      createdAt: new Date("2026-06-24T10:00:00Z"),
    });
    state.reminders.push({
      id: "rem-1",
      text: "Call Mum Sunday",
      fireAt: new Date("2026-06-29T10:00:00Z"),
      status: "pending",
      createdAt: new Date("2026-06-25T10:00:00Z"),
    });

    const out = await tool.handler({ query: "anything" }, ctx) as {
      count: number;
      items: Array<{ kind: string; at: string; preview: string }>;
    };
    expect(out.count).toBe(4);
    const kinds = out.items.map((i) => i.kind).sort();
    expect(kinds).toEqual(["expense", "memory", "message", "reminder"]);

    // Verify chronological ordering (newest first)
    const dates = out.items.map((i) => new Date(i.at).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]!);
    }
  });

  it("expense preview includes merchant + amount + currency", async () => {
    const { tool, ctx, state } = setup();
    state.expenses.push({
      id: "exp-1",
      amount: 4250,
      currency: "AUD",
      category: "coffee",
      merchant: "Industry Beans",
      occurredAt: new Date("2026-06-20T08:00:00Z"),
      createdAt: new Date("2026-06-20T08:00:00Z"),
    });
    const out = await tool.handler({ query: "coffee" }, ctx) as {
      items: Array<{ kind: string; preview: string; context: string | null }>;
    };
    const exp = out.items.find((i) => i.kind === "expense");
    expect(exp?.preview).toBe("Industry Beans 42.50 AUD");
    expect(exp?.context).toBe("coffee");
  });

  it("message hit reports direction context", async () => {
    const { tool, ctx, state } = setup();
    state.messages.push({
      id: "msg-1",
      direction: "out",
      surface: "whatsapp",
      fromNumber: OWNER_HASH,
      body: "Hey Mum hope your day is good",
      transcript: null,
      createdAt: new Date("2026-06-15T10:00:00Z"),
    });
    const out = await tool.handler({ query: "Mum" }, ctx) as {
      items: Array<{ kind: string; context: string | null }>;
    };
    const msg = out.items.find((i) => i.kind === "message");
    expect(msg?.context).toBe("from NitsyClaw");
  });

  it("respects limit", async () => {
    const { tool, ctx, state } = setup();
    for (let i = 0; i < 5; i++) {
      state.memories.push({
        id: `mem-${i}`,
        kind: "note",
        content: `note ${i}`,
        tags: [],
        createdAt: new Date(`2026-06-2${i}T10:00:00Z`),
      });
    }
    const out = await tool.handler({ query: "note", limit: 3 }, ctx) as { count: number };
    expect(out.count).toBe(3);
  });
});
