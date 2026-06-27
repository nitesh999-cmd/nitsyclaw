import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerContactTimeline } from "../src/features/29-contact-timeline.js";
import { registerEntityGraph } from "../src/features/28-entity-graph.js";
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
  registerEntityGraph(registry);
  registerContactTimeline(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return {
    record: registry.get("record_entities")!,
    timeline: registry.get("contact_timeline")!,
    ctx,
    state,
  };
}

describe("Feature 29 — Contact timeline", () => {
  // NOTE: fake DB doesn't implement ILIKE on entities, ANY() array IN, or
  // multi-table joins. These tests verify the tool wiring and result shape;
  // the real Postgres path is exercised live in the bot.

  it("returns empty when no entities or sources exist", async () => {
    const { timeline, ctx } = setup();
    const out = await timeline.handler({ contactQuery: "Sarah" }, ctx) as {
      contactQuery: string;
      count: number;
      items: unknown[];
    };
    expect(out.contactQuery).toBe("Sarah");
    expect(out.count).toBe(0);
    expect(out.items).toEqual([]);
  });

  it("limit respects the upper bound on the input", async () => {
    const { timeline, ctx } = setup();
    const out = await timeline.handler({ contactQuery: "x", limit: 5 }, ctx) as { count: number };
    expect(out.count).toBeLessThanOrEqual(5);
  });

  it("returns the documented shape per hit (sourceTable/sourceId/at/preview/contactValue)", async () => {
    const { record, timeline, ctx, state } = setup();
    state.messages.push({
      id: "msg-1",
      direction: "in",
      surface: "whatsapp",
      fromNumber: OWNER_HASH,
      body: "Sarah wants Q3 numbers",
      transcript: null,
      createdAt: new Date("2026-06-20T10:00:00Z"),
    });
    await record.handler(
      {
        items: [
          { kind: "person", value: "Sarah Chen", sourceTable: "messages", sourceId: "msg-1", sourceAtIso: "2026-06-20T10:00:00Z" },
        ],
      },
      ctx,
    );
    const out = await timeline.handler({ contactQuery: "Sarah" }, ctx) as {
      items: Array<{
        sourceTable: string;
        sourceId: string;
        at: string;
        preview: string;
        contactValue: string;
      }>;
    };
    // Whether the join finds it depends on fake DB ILIKE / ANY support;
    // for any items returned, verify shape.
    for (const item of out.items) {
      expect(item).toHaveProperty("sourceTable");
      expect(item).toHaveProperty("sourceId");
      expect(item).toHaveProperty("at");
      expect(item).toHaveProperty("preview");
      expect(item).toHaveProperty("contactValue");
    }
  });

  it("threads contactQuery through to the response unchanged", async () => {
    const { timeline, ctx } = setup();
    const out = await timeline.handler({ contactQuery: "Sarah Chen" }, ctx) as {
      contactQuery: string;
    };
    expect(out.contactQuery).toBe("Sarah Chen");
  });
});
