import { describe, expect, it } from "vitest";

import {
  deleteMemory,
  dueReminders,
  expensesBetween,
  getLatestPendingConfirmation,
  getPendingConfirmationById,
  insertConfirmation,
  insertExpense,
  insertMemory,
  insertReminder,
  markReminderFired,
  pruneExpiredConfirmations,
  searchMemoriesLexical,
  setConfirmationStatus,
  updateMemory,
  upsertBrief,
} from "../src/db/repo.js";
import { privateOwnerTenant } from "../src/tenancy.js";
import { makeFakeDb } from "./helpers.js";

const OWNER_A = privateOwnerTenant("owner-a");
const OWNER_B = privateOwnerTenant("owner-b");
const NOW = new Date("2026-07-05T09:00:00.000Z");

describe("tenant owner isolation", () => {
  it("does not leak or mutate another owner's memories", async () => {
    const { db, state } = makeFakeDb();
    const a = await insertMemory(db, OWNER_A, { kind: "note", content: "owner a passport", tags: ["private"] });
    const b = await insertMemory(db, OWNER_B, { kind: "note", content: "owner b passport", tags: ["private"] });

    const ownerAMemories = await searchMemoriesLexical(db, OWNER_A, "passport", 10);
    expect(ownerAMemories.map((row) => row.id)).toEqual([a.id]);

    expect(await updateMemory(db, OWNER_A, b.id, { content: "stolen" })).toBeNull();
    expect(await deleteMemory(db, OWNER_A, b.id)).toBe(false);
    expect(state.memories.find((row) => row.id === b.id)?.content).toBe("owner b passport");
  });

  it("does not leak or mutate another owner's reminders", async () => {
    const { db, state } = makeFakeDb();
    const a = await insertReminder(db, OWNER_A, { text: "owner a due", fireAt: new Date(NOW.getTime() - 60_000), rrule: null });
    const b = await insertReminder(db, OWNER_B, { text: "owner b due", fireAt: new Date(NOW.getTime() - 60_000), rrule: null });

    const due = await dueReminders(db, OWNER_A, NOW);
    expect(due.map((row) => row.id)).toEqual([a.id]);

    await markReminderFired(db, OWNER_A, b.id);
    expect(state.reminders.find((row) => row.id === b.id)?.status).toBe("pending");
  });

  it("does not leak another owner's expenses", async () => {
    const { db } = makeFakeDb();
    const a = await insertExpense(db, OWNER_A, {
      amount: 1200,
      currency: "AUD",
      category: "food",
      merchant: "Owner A Cafe",
      occurredAt: NOW,
      rawText: "owner a lunch",
    });
    await insertExpense(db, OWNER_B, {
      amount: 9900,
      currency: "AUD",
      category: "health",
      merchant: "Owner B Clinic",
      occurredAt: NOW,
      rawText: "owner b private",
    });

    const rows = await expensesBetween(db, OWNER_A, new Date(NOW.getTime() - 60_000), new Date(NOW.getTime() + 60_000));
    expect(rows.map((row) => row.id)).toEqual([a.id]);
  });

  it("keeps daily briefs unique per owner and date", async () => {
    const { db, state } = makeFakeDb();

    await upsertBrief(db, OWNER_A, "2026-07-05", "owner a first");
    await upsertBrief(db, OWNER_B, "2026-07-05", "owner b first");
    await upsertBrief(db, OWNER_A, "2026-07-05", "owner a updated");

    expect(state.briefs).toHaveLength(2);
    expect(state.briefs.find((row) => row.ownerHash === OWNER_A.ownerHash)?.body).toBe("owner a updated");
    expect(state.briefs.find((row) => row.ownerHash === OWNER_B.ownerHash)?.body).toBe("owner b first");
  });

  it("does not leak or mutate another owner's confirmations", async () => {
    const { db, state } = makeFakeDb();
    const a = await insertConfirmation(db, OWNER_A, "email_send", { subject: "owner a" }, new Date(NOW.getTime() + 60_000));
    const b = await insertConfirmation(db, OWNER_B, "email_send", { subject: "owner b" }, new Date(NOW.getTime() + 60_000));
    const expiredA = await insertConfirmation(db, OWNER_A, "cleanup", {}, new Date(NOW.getTime() - 60_000));
    const expiredB = await insertConfirmation(db, OWNER_B, "cleanup", {}, new Date(NOW.getTime() - 60_000));

    expect(await getPendingConfirmationById(db, OWNER_A, b.id)).toBeNull();
    expect((await getLatestPendingConfirmation(db, OWNER_A))?.id).toBe(a.id);

    await setConfirmationStatus(db, OWNER_A, b.id, "approved");
    expect(state.confirmations.find((row) => row.id === b.id)?.status).toBe("pending");

    await setConfirmationStatus(db, OWNER_A, a.id, "approved");
    expect(state.confirmations.find((row) => row.id === a.id)?.status).toBe("approved");

    expect(await pruneExpiredConfirmations(db, OWNER_A, NOW)).toBe(1);
    expect(state.confirmations.find((row) => row.id === expiredA.id)?.status).toBe("expired");
    expect(state.confirmations.find((row) => row.id === expiredB.id)?.status).toBe("pending");
  });
});
