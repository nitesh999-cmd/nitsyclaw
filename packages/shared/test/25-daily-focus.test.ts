import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerDailyFocus, runFocusEveningCloseOut } from "../src/features/25-daily-focus.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";
import { makeAgentDeps, makeFakeDb, getFakeDbState } from "./helpers.js";
import type { ToolContext } from "../src/agent/tools.js";

const NOW = new Date("2026-06-23T07:00:00.000Z"); // 2026-06-23 17:00 Sydney
const PHONE = "+61430008008";

function setup() {
  const { db, state } = makeFakeDb();
  const deps = makeAgentDeps({
    db,
    now: () => NOW,
    timezone: "Australia/Melbourne",
  });
  const registry = new ToolRegistry();
  registerDailyFocus(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return {
    propose: registry.get("propose_daily_focus")!,
    pick: registry.get("pick_daily_focus")!,
    markDone: registry.get("mark_daily_focus_done")!,
    get: registry.get("get_today_focus")!,
    ctx,
    state,
  };
}

describe("Feature 25 — Daily Focus Theme", () => {
  it("get_today_focus returns absent state on a fresh day", async () => {
    const { get, ctx } = setup();
    const out = await get.handler({} as Record<string, never>, ctx) as {
      present: boolean;
      candidates: string[];
      chosenText: string | null;
      completed: boolean;
    };
    expect(out.present).toBe(false);
    expect(out.candidates).toEqual([]);
    expect(out.chosenText).toBeNull();
    expect(out.completed).toBe(false);
  });

  it("propose_daily_focus saves candidates and is idempotent across re-proposes", async () => {
    const { propose, get, ctx, state } = setup();
    const first = await propose.handler(
      { candidates: ["Ship Feature 25", "Solar proposal for Hartley", "Gym"] },
      ctx,
    ) as { proposed: boolean; candidates: string[] };
    expect(first.proposed).toBe(true);
    expect(first.candidates).toHaveLength(3);
    expect(state.daily_focus).toHaveLength(1);

    // Re-propose replaces candidates without duplicating row.
    const second = await propose.handler(
      { candidates: ["A", "B"] },
      ctx,
    ) as { candidates: string[] };
    expect(second.candidates).toEqual(["A", "B"]);
    expect(state.daily_focus).toHaveLength(1);

    const seen = await get.handler({} as Record<string, never>, ctx) as {
      present: boolean;
      candidates: string[];
    };
    expect(seen.present).toBe(true);
    expect(seen.candidates).toEqual(["A", "B"]);
  });

  it("pick_daily_focus stores the chosen text and timestamp", async () => {
    const { propose, pick, get, ctx } = setup();
    await propose.handler(
      { candidates: ["Ship Feature 25", "Solar proposal", "Gym"] },
      ctx,
    );
    const out = await pick.handler(
      { chosenText: "Ship Feature 25" },
      ctx,
    ) as { picked: boolean; chosenText: string; chosenAt: string | null };
    expect(out.picked).toBe(true);
    expect(out.chosenText).toBe("Ship Feature 25");
    expect(out.chosenAt).not.toBeNull();

    const seen = await get.handler({} as Record<string, never>, ctx) as {
      chosenText: string | null;
      completed: boolean;
    };
    expect(seen.chosenText).toBe("Ship Feature 25");
    expect(seen.completed).toBe(false);
  });

  it("pick_daily_focus works without a prior propose (user can name their ONE directly)", async () => {
    const { pick, get, ctx, state } = setup();
    const out = await pick.handler(
      { chosenText: "Call Mum" },
      ctx,
    ) as { picked: boolean; chosenText: string };
    expect(out.picked).toBe(true);
    expect(state.daily_focus).toHaveLength(1);
    const seen = await get.handler({} as Record<string, never>, ctx) as { chosenText: string | null };
    expect(seen.chosenText).toBe("Call Mum");
  });

  it("mark_daily_focus_done marks completion when a pick exists", async () => {
    const { pick, markDone, get, ctx } = setup();
    await pick.handler({ chosenText: "Ship Feature 25" }, ctx);
    const out = await markDone.handler({} as Record<string, never>, ctx) as {
      marked: boolean;
      chosenText: string;
      completedAt: string | null;
    };
    expect(out.marked).toBe(true);
    expect(out.chosenText).toBe("Ship Feature 25");
    expect(out.completedAt).not.toBeNull();
    const seen = await get.handler({} as Record<string, never>, ctx) as { completed: boolean };
    expect(seen.completed).toBe(true);
  });

  it("mark_daily_focus_done returns marked:false when no row exists for today", async () => {
    const { markDone, ctx } = setup();
    const out = await markDone.handler({} as Record<string, never>, ctx) as {
      marked: boolean;
      reason?: string;
    };
    expect(out.marked).toBe(false);
    expect(out.reason).toMatch(/no focus/i);
  });
});

describe("Feature 25 — Evening close-out", () => {
  function setupCloseOut() {
    const wa = new MockWhatsAppClient();
    const { db, state } = makeFakeDb();
    const deps = makeAgentDeps({
      db,
      whatsapp: wa,
      now: () => NOW,
      timezone: "Australia/Melbourne",
    });
    const registry = new ToolRegistry();
    registerDailyFocus(registry);
    const ctx: ToolContext = {
      userPhone: PHONE,
      now: NOW,
      timezone: "Australia/Melbourne",
      deps,
    };
    return {
      pick: registry.get("pick_daily_focus")!,
      markDone: registry.get("mark_daily_focus_done")!,
      tool: registry.get("focus_evening_close_out")!,
      ctx,
      state,
      wa,
      db,
    };
  }

  it("returns state=no_focus_set and sends 'no ONE was set' when nothing picked", async () => {
    const { tool, ctx, wa } = setupCloseOut();
    const out = await tool.handler({} as Record<string, never>, ctx) as {
      state: string;
      delivered: boolean;
    };
    expect(out.state).toBe("no_focus_set");
    expect(out.delivered).toBe(true);
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0]?.body).toMatch(/no ONE was set/i);
  });

  it("returns state=focus_open and sends 'Did you ship it?' when picked but not done", async () => {
    const { tool, pick, ctx, wa } = setupCloseOut();
    await pick.handler({ chosenText: "Ship Feature 28" }, ctx);
    const out = await tool.handler({} as Record<string, never>, ctx) as {
      state: string;
      chosenText: string | null;
    };
    expect(out.state).toBe("focus_open");
    expect(out.chosenText).toBe("Ship Feature 28");
    expect(wa.sent.at(-1)?.body).toMatch(/Did you ship it\?/);
    expect(wa.sent.at(-1)?.body).toContain("Ship Feature 28");
  });

  it("returns state=focus_completed and sends affirmation when picked and done", async () => {
    const { tool, pick, markDone, ctx, wa } = setupCloseOut();
    await pick.handler({ chosenText: "Ship Feature 28" }, ctx);
    await markDone.handler({} as Record<string, never>, ctx);
    const out = await tool.handler({} as Record<string, never>, ctx) as { state: string };
    expect(out.state).toBe("focus_completed");
    expect(wa.sent.at(-1)?.body).toMatch(/Marked done/i);
    expect(wa.sent.at(-1)?.body).toContain("Ship Feature 28");
  });

  it("runFocusEveningCloseOut helper works directly with db + whatsapp args", async () => {
    const { pick, ctx, wa, db } = setupCloseOut();
    await pick.handler({ chosenText: "Direct helper test" }, ctx);
    const out = await runFocusEveningCloseOut(db, wa, PHONE, NOW, "Australia/Melbourne");
    expect(out.state).toBe("focus_open");
    expect(out.delivered).toBe(true);
    expect(out.chosenText).toBe("Direct helper test");
  });
});
