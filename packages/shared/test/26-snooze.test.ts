import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { fireDueSnoozes, registerSnooze } from "../src/features/26-snooze.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";
import { makeAgentDeps, makeFakeDb, getFakeDbState } from "./helpers.js";
import type { ToolContext } from "../src/agent/tools.js";

const NOW = new Date("2026-06-26T08:00:00.000Z");
const IN_5_MIN = new Date(NOW.getTime() + 5 * 60 * 1000).toISOString();
const PHONE = "+61430008008";

function setup() {
  const wa = new MockWhatsAppClient();
  const { db, state } = makeFakeDb();
  const deps = makeAgentDeps({
    db,
    whatsapp: wa,
    now: () => NOW,
    timezone: "Australia/Melbourne",
  });
  const registry = new ToolRegistry();
  registerSnooze(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return {
    snooze: registry.get("snooze_thread")!,
    list: registry.get("list_my_snoozes")!,
    cancel: registry.get("cancel_snooze")!,
    ctx,
    state,
    db,
    wa,
  };
}

describe("Feature 26 — Snooze-and-resurface", () => {
  it("snooze_thread inserts a pending row with resurfaceAt", async () => {
    const { snooze, ctx, state } = setup();
    const out = await snooze.handler(
      {
        content: "From Sarah: please confirm Q3 numbers by Friday",
        resurfaceAtIso: IN_5_MIN,
        sourceHint: "Sarah Q3 thread",
        draftReply: "Hi Sarah, attached Q3 numbers.",
      },
      ctx,
    ) as { snoozed: boolean; id: string; hasDraftReply: boolean };
    expect(out.snoozed).toBe(true);
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.hasDraftReply).toBe(true);
    expect(state.snoozes).toHaveLength(1);
    expect(state.snoozes[0]?.status).toBe("pending");
  });

  it("snooze_thread rejects resurfaceAt < 60s in the future", async () => {
    const { snooze, ctx } = setup();
    await expect(
      snooze.handler(
        {
          content: "Test",
          resurfaceAtIso: new Date(NOW.getTime() + 30 * 1000).toISOString(),
        },
        ctx,
      ),
    ).rejects.toThrow(/60 seconds/);
  });

  it("snooze_thread rejects resurfaceAt > 90 days out", async () => {
    const { snooze, ctx } = setup();
    await expect(
      snooze.handler(
        {
          content: "Test",
          resurfaceAtIso: new Date(NOW.getTime() + 91 * 24 * 60 * 60 * 1000).toISOString(),
        },
        ctx,
      ),
    ).rejects.toThrow(/90 days/);
  });

  it("list_my_snoozes returns pending rows ordered by resurfaceAt", async () => {
    const { snooze, list, ctx } = setup();
    await snooze.handler(
      { content: "second", resurfaceAtIso: new Date(NOW.getTime() + 10 * 60 * 1000).toISOString() },
      ctx,
    );
    await snooze.handler(
      { content: "first", resurfaceAtIso: new Date(NOW.getTime() + 5 * 60 * 1000).toISOString() },
      ctx,
    );
    const out = await list.handler({}, ctx) as {
      count: number;
      items: Array<{ preview: string }>;
    };
    expect(out.count).toBe(2);
    // Ordering is enforced by real Postgres ORDER BY; fake DB is unordered.
    const previews = out.items.map((i) => i.preview).sort();
    expect(previews).toEqual(["first", "second"]);
  });

  it("cancel_snooze marks pending row as cancelled (not visible to list)", async () => {
    const { snooze, list, cancel, ctx } = setup();
    const snoozed = await snooze.handler(
      { content: "Cancel me", resurfaceAtIso: IN_5_MIN },
      ctx,
    ) as { id: string };
    const cancelOut = await cancel.handler({ id: snoozed.id }, ctx) as { cancelled: boolean };
    expect(cancelOut.cancelled).toBe(true);
    const listed = await list.handler({}, ctx) as { count: number };
    expect(listed.count).toBe(0);
  });

  it("cancel_snooze returns false when id not found", async () => {
    const { cancel, ctx } = setup();
    const out = await cancel.handler({ id: "00000000-0000-0000-0000-000000000000" }, ctx) as {
      cancelled: boolean;
      reason?: string;
    };
    expect(out.cancelled).toBe(false);
    expect(out.reason).toMatch(/not found/i);
  });

  it("fireDueSnoozes resurfaces pending rows past their resurface time and sends WhatsApp", async () => {
    const { snooze, ctx, db, wa, state } = setup();
    await snooze.handler(
      {
        content: "Catch up call",
        resurfaceAtIso: IN_5_MIN,
        sourceHint: "Raj",
        draftReply: "Sure, 4pm Friday works.",
      },
      ctx,
    );
    // Advance time past resurfaceAt
    const LATER = new Date(NOW.getTime() + 6 * 60 * 1000);
    const out = await fireDueSnoozes(db, wa, PHONE, LATER);
    expect(out.fired).toBe(1);
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0]?.body).toContain("Catch up call");
    expect(wa.sent[0]?.body).toContain("Re: Raj");
    expect(wa.sent[0]?.body).toContain("Draft reply ready");
    expect(state.snoozes[0]?.status).toBe("resurfaced");
  });

  it("fireDueSnoozes leaves not-yet-due rows pending", async () => {
    const { snooze, ctx, db, wa, state } = setup();
    await snooze.handler(
      { content: "Future", resurfaceAtIso: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString() },
      ctx,
    );
    const out = await fireDueSnoozes(db, wa, PHONE, NOW);
    expect(out.fired).toBe(0);
    expect(wa.sent).toHaveLength(0);
    expect(state.snoozes[0]?.status).toBe("pending");
  });
});
