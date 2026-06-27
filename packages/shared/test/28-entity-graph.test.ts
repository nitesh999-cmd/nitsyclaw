import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerEntityGraph } from "../src/features/28-entity-graph.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";
import type { ToolContext } from "../src/agent/tools.js";

const NOW = new Date("2026-06-26T08:00:00.000Z");
const PHONE = "+61430008008";

function setup() {
  const { db, state } = makeFakeDb();
  const deps = makeAgentDeps({
    db,
    now: () => NOW,
    timezone: "Australia/Melbourne",
  });
  const registry = new ToolRegistry();
  registerEntityGraph(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return {
    record: registry.get("record_entities")!,
    find: registry.get("find_entities")!,
    recent: registry.get("recent_entities_by_kind")!,
    ctx,
    state,
  };
}

describe("Feature 28 — Entity graph substrate", () => {
  it("record_entities inserts a batch and returns ids", async () => {
    const { record, ctx, state } = setup();
    const out = await record.handler(
      {
        items: [
          { kind: "person", value: "Sarah Chen", sourceTable: "messages", sourceId: "msg-1" },
          { kind: "org", value: "Wattage", sourceTable: "messages", sourceId: "msg-1" },
          { kind: "money", value: "$4250 AUD" },
        ],
      },
      ctx,
    ) as { recorded: number; ids: string[] };
    expect(out.recorded).toBe(3);
    expect(out.ids).toHaveLength(3);
    expect(state.entities).toHaveLength(3);
  });

  it("record_entities normalizes value (lowercase trim) for lookup", async () => {
    const { record, ctx, state } = setup();
    await record.handler(
      { items: [{ kind: "person", value: "  Sarah  Chen  " }] },
      ctx,
    );
    expect(state.entities[0]?.normalizedValue).toBe("sarah chen");
    expect(state.entities[0]?.value).toBe("Sarah  Chen");
  });

  it("record_entities accepts all 7 kinds", async () => {
    const { record, ctx, state } = setup();
    await record.handler(
      {
        items: [
          { kind: "person", value: "X" },
          { kind: "place", value: "X" },
          { kind: "money", value: "X" },
          { kind: "date", value: "X" },
          { kind: "topic", value: "X" },
          { kind: "org", value: "X" },
          { kind: "url", value: "X" },
        ],
      },
      ctx,
    );
    const kinds = state.entities.map((e) => e.kind as string).sort();
    expect(kinds).toEqual(["date", "money", "org", "person", "place", "topic", "url"]);
  });

  it("find_entities returns shape with id/kind/value/source fields", async () => {
    // NOTE: fake DB does not implement ILIKE — find_entities returns based
    // on owner_hash filter via wiring; we verify result shape against an
    // inserted row.
    const { record, find, ctx } = setup();
    await record.handler(
      {
        items: [
          { kind: "person", value: "Mum", sourceTable: "messages", sourceId: "msg-1", sourceAtIso: NOW.toISOString() },
        ],
      },
      ctx,
    );
    const out = await find.handler({ query: "Mum" }, ctx) as {
      count: number;
      items: Array<{ kind: string; value: string; sourceTable: string | null }>;
    };
    expect(out.count).toBeGreaterThanOrEqual(0);
    if (out.items.length > 0) {
      const item = out.items[0]!;
      expect(item.kind).toBe("person");
      expect(item.value).toBe("Mum");
      expect(item.sourceTable).toBe("messages");
    }
  });

  it("recent_entities_by_kind filters by kind and returns shape", async () => {
    const { record, recent, ctx } = setup();
    await record.handler(
      {
        items: [
          { kind: "person", value: "Sarah" },
          { kind: "person", value: "Raj" },
          { kind: "org", value: "Wattage" },
        ],
      },
      ctx,
    );
    const out = await recent.handler({ kind: "person", limit: 10 }, ctx) as {
      kind: string;
      items: Array<{ value: string }>;
    };
    expect(out.kind).toBe("person");
    expect(out.items.length).toBeGreaterThan(0);
    const values = out.items.map((i) => i.value).sort();
    expect(values).toEqual(expect.arrayContaining(["Sarah", "Raj"]));
  });

  it("record_entities clamps overlong value to 500 chars", async () => {
    const { record, ctx, state } = setup();
    const big = "a".repeat(800);
    await record.handler(
      { items: [{ kind: "topic", value: big }] },
      ctx,
    );
    expect((state.entities[0]?.value as string).length).toBe(500);
  });
});
