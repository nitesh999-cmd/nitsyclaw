import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerOrphanRadar } from "../src/features/32-orphan-radar.js";
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
  registerOrphanRadar(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return { tool: registry.get("find_orphans")!, ctx, state };
}

describe("Feature 32 — Orphan radar", () => {
  // NOTE: fake DB doesn't implement gte/lte/and on dates, so the items
  // returned in some shape paths may not filter exactly as real Postgres.
  // Tests verify wiring, shape, and the JS-side post-processing.

  it("returns empty when nothing pending", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler({}, ctx) as { count: number; items: unknown[] };
    expect(out.count).toBe(0);
    expect(out.items).toEqual([]);
  });

  it("returns shape with windowHours, staleContactDays, items array", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler({}, ctx) as {
      windowHours: number;
      staleContactDays: number;
      count: number;
      items: Array<{ kind: string }>;
    };
    expect(out.windowHours).toBe(48);
    expect(out.staleContactDays).toBe(7);
    expect(Array.isArray(out.items)).toBe(true);
  });

  it("honours custom windowHours and staleContactDays", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler({ windowHours: 24, staleContactDays: 14 }, ctx) as {
      windowHours: number;
      staleContactDays: number;
    };
    expect(out.windowHours).toBe(24);
    expect(out.staleContactDays).toBe(14);
  });

  it("flags stale contacts when person entity last seen older than threshold", async () => {
    const { tool, ctx, state } = setup();
    // Sarah last mentioned 10 days ago, threshold 7 days -> should appear.
    state.entities.push({
      id: "ent-1",
      ownerHash: OWNER_HASH,
      kind: "person",
      value: "Sarah",
      normalizedValue: "sarah",
      sourceTable: "messages",
      sourceId: "msg-1",
      sourceAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
      createdAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
    });
    // Raj mentioned today -> should NOT appear.
    state.entities.push({
      id: "ent-2",
      ownerHash: OWNER_HASH,
      kind: "person",
      value: "Raj",
      normalizedValue: "raj",
      sourceTable: "messages",
      sourceId: "msg-2",
      sourceAt: NOW,
      createdAt: NOW,
    });

    const out = await tool.handler({ staleContactDays: 7 }, ctx) as {
      items: Array<{ kind: string; preview: string }>;
    };
    const stale = out.items.filter((i) => i.kind === "stale_contact");
    expect(stale).toHaveLength(1);
    expect(stale[0]?.preview).toContain("Sarah");
    expect(stale[0]?.preview).toContain("10d ago");
  });

  it("ignores sentinel __none__ entities (auto-extract worker placeholder)", async () => {
    const { tool, ctx, state } = setup();
    state.entities.push({
      id: "ent-sentinel",
      ownerHash: OWNER_HASH,
      kind: "person",
      value: "__none__msg-x",
      normalizedValue: "__none__msg-x",
      sourceTable: "messages",
      sourceId: "msg-x",
      sourceAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
    });
    const out = await tool.handler({}, ctx) as { items: Array<{ kind: string }> };
    expect(out.items.filter((i) => i.kind === "stale_contact")).toHaveLength(0);
  });
});
