import { describe, expect, it } from "vitest";
import { buildBrief, runMorningBrief } from "../src/features/04-morning-brief.js";
import { makeAgentDeps } from "./helpers.js";
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
});
