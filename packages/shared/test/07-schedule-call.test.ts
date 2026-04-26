import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerScheduleCall } from "../src/features/07-schedule-call.js";
import { makeAgentDeps } from "./helpers.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";

describe("schedule_call tool", () => {
  it("creates a pending confirmation and DMs the user", async () => {
    const r = new ToolRegistry();
    registerScheduleCall(r);
    const wa = new MockWhatsAppClient();
    const deps = makeAgentDeps({ whatsapp: wa });
    const tool = r.get("schedule_call")!;
    const out = await tool.handler(
      {
        title: "Sync",
        participantEmail: "priya@example.com",
        durationMin: 30,
        windowStartIso: "2026-04-26T05:00:00Z",
        windowEndIso: "2026-04-26T15:00:00Z",
      },
      { userPhone: "+9100", now: new Date(), timezone: "UTC", deps },
    );
    expect((out as any).confirmationId).toBeTruthy();
    expect(wa.sent.length).toBe(1);
    expect(wa.sent[0].body).toContain("Reply 'y'");
  });

  it("rejects backwards windows", async () => {
    const r = new ToolRegistry();
    registerScheduleCall(r);
    const deps = makeAgentDeps();
    const tool = r.get("schedule_call")!;
    await expect(
      tool.handler(
        {
          title: "x",
          participantEmail: "x@y.com",
          durationMin: 30,
          windowStartIso: "2026-04-26T15:00:00Z",
          windowEndIso: "2026-04-26T05:00:00Z",
        },
        { userPhone: "+9100", now: new Date(), timezone: "UTC", deps },
      ),
    ).rejects.toThrow(/end must be after start/);
  });

  it("rejects invalid timestamps", async () => {
    const r = new ToolRegistry();
    registerScheduleCall(r);
    const deps = makeAgentDeps();
    const tool = r.get("schedule_call")!;
    await expect(
      tool.handler(
        {
          title: "x",
          participantEmail: "x@y.com",
          durationMin: 30,
          windowStartIso: "not-a-date",
          windowEndIso: "also-not",
        },
        { userPhone: "+9100", now: new Date(), timezone: "UTC", deps },
      ),
    ).rejects.toThrow();
  });
});
