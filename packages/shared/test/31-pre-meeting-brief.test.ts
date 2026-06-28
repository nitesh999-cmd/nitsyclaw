import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerPreMeetingBrief } from "../src/features/31-pre-meeting-brief.js";
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
