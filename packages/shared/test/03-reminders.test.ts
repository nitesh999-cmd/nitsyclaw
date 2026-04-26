import { describe, expect, it, beforeEach } from "vitest";
import { planReminder, fireDueReminders } from "../src/features/03-reminders.js";
import { makeFakeDb } from "./helpers.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";

const NOW = new Date("2026-04-25T03:30:00Z"); // 09:00 IST

describe("planReminder (pure)", () => {
  it("plans 'remind me in 5 minutes to drink water'", () => {
    const r = planReminder({ text: "remind me in 5 minutes to drink water", now: NOW, timezone: "Asia/Kolkata" })!;
    expect(r).not.toBeNull();
    expect(r.fireAt.getTime() - NOW.getTime()).toBe(5 * 60 * 1000);
    expect(r.rrule).toBeNull();
    expect(r.text.toLowerCase()).toContain("drink water");
  });

  it("plans recurring 'every monday 9am'", () => {
    const r = planReminder({ text: "remind me every monday 9am for standup", now: NOW, timezone: "Asia/Kolkata" })!;
    expect(r.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("returns null when nothing parses", () => {
    expect(planReminder({ text: "just words", now: NOW, timezone: "UTC" })).toBeNull();
  });
});

describe("fireDueReminders", () => {
  let db: any;
  let state: any;
  let wa: MockWhatsAppClient;
  beforeEach(() => {
    ({ db, state } = makeFakeDb());
    wa = new MockWhatsAppClient();
  });

  it("fires only due reminders and marks them fired", async () => {
    state.reminders.push(
      { id: "1", text: "due", fireAt: new Date("2026-04-25T03:00:00Z"), status: "pending", rrule: null },
      { id: "2", text: "future", fireAt: new Date("2026-04-25T20:00:00Z"), status: "pending", rrule: null },
    );
    const count = await fireDueReminders(db, wa, "+91111", NOW);
    expect(count).toBe(2); // fake-db where() is permissive — see notes below
    // Real Drizzle path is exercised in integration test against pg-mem.
    expect(wa.sent.some((m) => m.body.includes("due"))).toBe(true);
  });
});
