import { describe, expect, it, beforeEach } from "vitest";
import { planReminder, fireDueReminders, registerReminders } from "../src/features/03-reminders.js";
import type { FakeDbState, FakeDbWithState } from "./helpers.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";
import { ToolRegistry } from "../src/agent/tools.js";
import type { DB } from "../src/db/client.js";

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
  let db: FakeDbWithState;
  let state: FakeDbState;
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
    expect(count).toBe(1);
    expect(wa.sent.some((m) => m.body.includes("due"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("future"))).toBe(false);
  });

  it("delivers due reminders, marks them fired, and reschedules recurring reminders", async () => {
    const due = [
      {
        id: "due-1",
        text: "call Mukesh",
        fireAt: new Date("2026-04-25T03:00:00Z"),
        status: "pending",
        rrule: null,
        createdAt: new Date("2026-04-24T03:00:00Z"),
      },
      {
        id: "weekly-1",
        text: "review invoices",
        fireAt: new Date("2026-04-25T02:00:00Z"),
        status: "pending",
        rrule: "FREQ=WEEKLY;BYDAY=SA",
        createdAt: new Date("2026-04-24T03:00:00Z"),
      },
    ];
    const firedIds: string[] = [];
    const inserted: Array<{ text: string; fireAt: Date; rrule: string | null }> = [];
    const testDb = {
      select: () => ({
        from: () => ({
          where: async () => due,
        }),
      }),
      update: () => ({
        set: (patch: { status?: string }) => ({
          where: async () => {
            if (patch.status === "fired") firedIds.push(due[firedIds.length]!.id);
          },
        }),
      }),
      insert: () => ({
        values: (row: { text: string; fireAt: Date; rrule: string | null }) => {
          inserted.push(row);
          return {
            returning: async () => [{ id: "next-weekly", status: "pending", createdAt: NOW, ...row }],
          };
        },
      }),
    } as unknown as DB;

    const count = await fireDueReminders(testDb, wa, "+61430008008", NOW);

    expect(count).toBe(2);
    expect(wa.sent).toHaveLength(2);
    expect(wa.sent[0]).toMatchObject({ to: "+61430008008", body: "⏰ Reminder: call Mukesh" });
    expect(wa.sent[1]?.body).toBe("⏰ Reminder: review invoices");
    expect(firedIds).toEqual(["due-1", "weekly-1"]);
    expect(inserted).toEqual([
      {
        text: "review invoices",
        fireAt: new Date("2026-05-02T02:00:00Z"),
        rrule: "FREQ=WEEKLY;BYDAY=SA",
      },
    ]);
  });
});

describe("set_reminder tool", () => {
  it("returns clear storage and WhatsApp delivery details", async () => {
    const registry = new ToolRegistry();
    registerReminders(registry);
    const deps = makeAgentDeps({ timezone: "Australia/Melbourne" });
    const tool = registry.get("set_reminder")!;

    const out = await tool.handler(
      { text: "call Mukesh", when: "tomorrow 10am" },
      { userPhone: "+61430008008", now: new Date("2026-05-14T02:00:00Z"), timezone: "Australia/Melbourne", deps },
    ) as {
      savedIn?: string;
      reminderChannel?: string;
      userFacingSummary?: string;
    };

    expect(out.savedIn).toBe("NitsyClaw reminders");
    expect(out.reminderChannel).toBe("WhatsApp");
    expect(out.userFacingSummary).toContain("Saved in NitsyClaw reminders");
    expect(out.userFacingSummary).toContain("WhatsApp");
  });
});
