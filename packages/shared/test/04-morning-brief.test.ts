import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { buildBrief, registerMorningBrief, runMorningBrief } from "../src/features/04-morning-brief.js";
import { getFakeDbState, makeAgentDeps } from "./helpers.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";

const NOW = new Date("2026-04-25T01:30:00Z"); // 07:00 IST

describe("buildBrief", () => {
  it("includes top priority", () => {
    const b = buildBrief({
      now: NOW,
      timezone: "Asia/Kolkata",
      inputs: { events: [], reminders: [], topPriority: "ship the demo" },
    });
    expect(b.body).toContain("ship the demo");
    expect(b.date).toBe("2026-04-25");
  });

  it("lists events", () => {
    const b = buildBrief({
      now: NOW,
      timezone: "Asia/Kolkata",
      inputs: {
        events: [
          { title: "Standup", start: new Date("2026-04-25T03:30:00Z") },
          { title: "1:1 Priya", start: new Date("2026-04-25T05:00:00Z") },
        ],
        reminders: [],
      },
    });
    expect(b.body).toContain("Standup");
    expect(b.body).toContain("1:1 Priya");
  });

  it("notes empty calendar", () => {
    const b = buildBrief({ now: NOW, timezone: "Asia/Kolkata", inputs: { events: [], reminders: [] } });
    expect(b.body).toContain("nothing scheduled");
  });

  it("builds a short action brief from reminders, unread mail, weather, follow-ups, and queue state", () => {
    const b = buildBrief({
      now: NOW,
      timezone: "Australia/Melbourne",
      inputs: {
        events: [{ title: "School pickup", start: new Date("2026-04-25T05:30:00Z"), source: "Google" }],
        reminders: [{ text: "Call Mukesh", fireAt: new Date("2026-04-25T02:00:00Z") }],
        unreadEmails: [{ source: "Gmail", from: "AGL <billing@example.com>", subject: "Bill due soon" }],
        whatsappFollowUps: [{ text: "Please check the electricity plan tomorrow", createdAt: new Date("2026-04-25T00:30:00Z") }],
        queueItems: [{ description: "Build Privacy Command Center", severity: "P1", createdAt: NOW }],
        topPriority: "finish the customer demo",
        weatherSummary: "Cloudy, light wind",
        locationUsed: "Melbourne",
      },
    });

    expect(b.body).toContain("Top actions:");
    expect(b.body).toContain("finish the customer demo");
    expect(b.body).toContain("Next reminder: Call Mukesh");
    expect(b.body).toContain("Top unread (1 across accounts):");
    expect(b.body).toContain("Weather: Cloudy, light wind");
    expect(b.body).toContain("Location used: Melbourne");
    expect(b.body).toContain("WhatsApp follow-ups (1 recent):");
    expect(b.body).toContain("Build queue: 1 pending");
  });
});

describe("runMorningBrief", () => {
  it("sends and persists", async () => {
    const wa = new MockWhatsAppClient();
    const deps = makeAgentDeps({ whatsapp: wa });
    const out = await runMorningBrief({
      now: NOW,
      ownerPhone: "+91",
      deps,
      inputs: { events: [], reminders: [], topPriority: "x" },
    });
    expect(out.delivered).toBe(true);
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0].body).toContain("Brief for");
  });

  it("registered tool pulls safe local daily brief sources", async () => {
    const wa = new MockWhatsAppClient();
    const deps = makeAgentDeps({
      whatsapp: wa,
      profile: { currentLocation: "Melbourne" },
      aggregator: {
        async fetchAllEventsToday() {
          return [{ source: "Google", title: "Demo call", start: new Date("2026-04-25T04:00:00Z") }];
        },
        async fetchAllUnreadEmails() {
          return [{ source: "Gmail", from: "AGL <billing@example.com>", subject: "Energy bill due" }];
        },
      },
    });
    const state = getFakeDbState(deps.db);
    state.reminders.push({
      id: "reminder-1",
      text: "Call Mukesh",
      fireAt: new Date("2026-04-25T09:00:00Z"),
      status: "pending",
      createdAt: NOW,
    });
    state.feature_requests.push({
      id: "feature-1",
      description: "Build Daily Brief V2",
      type: "feature",
      severity: "P1",
      status: "pending",
      source: "dashboard",
      createdAt: NOW,
    });
    state.messages.push({
      id: "message-1",
      direction: "in",
      surface: "whatsapp",
      fromNumber: "+91",
      body: "Please check the cheaper electricity plan",
      createdAt: NOW,
    });

    const registry = new ToolRegistry();
    registerMorningBrief(registry);
    const tool = registry.get("send_morning_brief_now");
    await tool?.handler({ topPriority: "finish the launch plan" }, {
      userPhone: "+91",
      now: NOW,
      timezone: "Asia/Kolkata",
      deps,
    });

    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0].body).toContain("Top actions:");
    expect(wa.sent[0].body).toContain("Call Mukesh");
    expect(wa.sent[0].body).toContain("Energy bill due");
    expect(wa.sent[0].body).toContain("WhatsApp follow-ups");
    expect(wa.sent[0].body).toContain("Build Daily Brief V2");
    expect(wa.sent[0].body).toContain("Location used: Melbourne");
  });
});
