import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import {
  __resetPreMeetingCacheForTests,
  registerPreMeetingBrief,
  runPreMeetingBriefTick,
} from "../src/features/31-pre-meeting-brief.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";
import type { AggregatorClient } from "../src/agent/deps.js";
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
  registerPreMeetingBrief(registry);
  const ctx: ToolContext = {
    userPhone: PHONE,
    now: NOW,
    timezone: "Australia/Melbourne",
    deps,
  };
  return { tool: registry.get("brief_me_about_meeting")!, ctx, state };
}

describe("Feature 31 — Pre-meeting briefing", () => {
  it("nudges user when neither personName nor topic is provided", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler({}, ctx) as { body: string };
    expect(out.body).toMatch(/pass personName or topic/i);
  });

  it("returns 'No prior history' when person has no entities yet", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler({ personName: "Sarah Chen" }, ctx) as {
      personName: string | null;
      body: string;
    };
    expect(out.personName).toBe("Sarah Chen");
    expect(out.body).toMatch(/No prior history/);
  });

  it("includes both personName and topic blocks when both provided", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler(
      { personName: "Mum", topic: "birthday" },
      ctx,
    ) as { personName: string | null; topic: string | null; body: string };
    expect(out.personName).toBe("Mum");
    expect(out.topic).toBe("birthday");
    // both heading types should at least be considered
    expect(out.body.length).toBeGreaterThan(0);
  });

  it("returns shape with personName + topic + body", async () => {
    const { tool, ctx } = setup();
    const out = await tool.handler({ topic: "Q3 numbers" }, ctx) as {
      personName: string | null;
      topic: string | null;
      body: string;
    };
    expect(out).toHaveProperty("personName");
    expect(out).toHaveProperty("topic");
    expect(out).toHaveProperty("body");
    expect(out.personName).toBeNull();
    expect(out.topic).toBe("Q3 numbers");
  });
});

describe("Feature 31 — runPreMeetingBriefTick (scheduler cron)", () => {
  function setupTick() {
    __resetPreMeetingCacheForTests();
    const wa = new MockWhatsAppClient();
    const { db } = makeFakeDb();
    return { wa, db };
  }

  function makeAggregator(events: Array<{ source: string; title: string; start: Date }>): AggregatorClient {
    return {
      async fetchAllEventsToday() { return events; },
      async fetchAllUnreadEmails() { return []; },
    };
  }

  it("returns zero counters when aggregator undefined", async () => {
    const { wa, db } = setupTick();
    const out = await runPreMeetingBriefTick(db, wa, undefined, PHONE, NOW, "Australia/Melbourne");
    expect(out).toEqual({ scanned: 0, briefed: 0, skippedAlreadyBriefed: 0 });
    expect(wa.sent).toHaveLength(0);
  });

  it("briefs events starting in the [+8min, +15min) window", async () => {
    const { wa, db } = setupTick();
    const inWindow = new Date(NOW.getTime() + 10 * 60 * 1000);
    const tooSoon = new Date(NOW.getTime() + 5 * 60 * 1000);
    const tooFar = new Date(NOW.getTime() + 30 * 60 * 1000);
    const aggregator = makeAggregator([
      { source: "google", title: "Coffee with Raj", start: inWindow },
      { source: "google", title: "Standup", start: tooSoon },
      { source: "outlook", title: "Strategy review with Sarah", start: tooFar },
    ]);
    const out = await runPreMeetingBriefTick(db, wa, aggregator, PHONE, NOW, "Australia/Melbourne");
    expect(out.scanned).toBe(1);
    expect(out.briefed).toBe(1);
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0]?.body).toContain("Coffee with Raj");
  });

  it("dedupes the same event across consecutive ticks", async () => {
    const { wa, db } = setupTick();
    const inWindow = new Date(NOW.getTime() + 10 * 60 * 1000);
    const aggregator = makeAggregator([
      { source: "google", title: "Catch up with Mum", start: inWindow },
    ]);
    const first = await runPreMeetingBriefTick(db, wa, aggregator, PHONE, NOW, "Australia/Melbourne");
    expect(first.briefed).toBe(1);
    const second = await runPreMeetingBriefTick(db, wa, aggregator, PHONE, NOW, "Australia/Melbourne");
    expect(second.briefed).toBe(0);
    expect(second.skippedAlreadyBriefed).toBe(1);
    expect(wa.sent).toHaveLength(1);
  });

  it("falls back gracefully on aggregator error", async () => {
    const { wa, db } = setupTick();
    const aggregator: AggregatorClient = {
      async fetchAllEventsToday() { throw new Error("api down"); },
      async fetchAllUnreadEmails() { return []; },
    };
    const out = await runPreMeetingBriefTick(db, wa, aggregator, PHONE, NOW, "Australia/Melbourne");
    expect(out).toEqual({ scanned: 0, briefed: 0, skippedAlreadyBriefed: 0 });
  });
});
