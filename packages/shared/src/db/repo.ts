// Thin repository functions used by features. Keeps SQL out of feature code.

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { DB } from "./client.js";
import {
  messages,
  memories,
  reminders,
  expenses,
  briefs,
  confirmations,
  auditLog,
  featureRequests,
  type NewMessage,
  type NewMemory,
  type NewReminder,
  type NewExpense,
  type Reminder,
  type Memory,
  type NewFeatureRequest,
  type FeatureRequest,
} from "./schema.js";

export async function insertMessage(db: DB, m: NewMessage) {
  const [row] = await db.insert(messages).values(m).returning();
  return row!;
}

export async function recentMessages(db: DB, fromNumber: string, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.fromNumber, fromNumber))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

export async function insertMemory(db: DB, m: NewMemory) {
  const [row] = await db.insert(memories).values(m).returning();
  return row!;
}

/**
 * Naive lexical search — replaced with pgvector cosine search once embeddings
 * are populated. Used as the v1 fallback so the feature works even before
 * embeddings exist.
 */
export async function searchMemoriesLexical(
  db: DB,
  query: string,
  limit = 10,
): Promise<Memory[]> {
  const q = `%${query.toLowerCase()}%`;
  return db
    .select()
    .from(memories)
    .where(sql`lower(${memories.content}) LIKE ${q}`)
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

export async function insertReminder(db: DB, r: NewReminder) {
  const [row] = await db.insert(reminders).values(r).returning();
  return row!;
}

export async function dueReminders(db: DB, now: Date): Promise<Reminder[]> {
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, "pending"), lte(reminders.fireAt, now)));
}

export async function markReminderFired(db: DB, id: string) {
  await db.update(reminders).set({ status: "fired" }).where(eq(reminders.id, id));
}

export async function insertExpense(db: DB, e: NewExpense) {
  const [row] = await db.insert(expenses).values(e).returning();
  return row!;
}

export async function expensesBetween(db: DB, from: Date, to: Date) {
  return db
    .select()
    .from(expenses)
    .where(and(gte(expenses.occurredAt, from), lte(expenses.occurredAt, to)));
}

export async function upsertBrief(db: DB, forDate: string, body: string) {
  await db
    .insert(briefs)
    .values({ forDate, body })
    .onConflictDoUpdate({ target: briefs.forDate, set: { body } });
}

export async function insertConfirmation(
  db: DB,
  action: string,
  payload: Record<string, unknown>,
  expiresAt: Date,
) {
  const [row] = await db
    .insert(confirmations)
    .values({ action, payload, expiresAt })
    .returning();
  return row!;
}

export async function setConfirmationStatus(
  db: DB,
  id: string,
  status: "approved" | "rejected" | "expired",
) {
  await db.update(confirmations).set({ status }).where(eq(confirmations.id, id));
}

export async function insertFeatureRequest(
  db: DB,
  req: NewFeatureRequest,
): Promise<FeatureRequest> {
  const [row] = await db.insert(featureRequests).values(req).returning();
  return row!;
}

export async function listPendingFeatureRequests(db: DB): Promise<FeatureRequest[]> {
  return db
    .select()
    .from(featureRequests)
    .where(eq(featureRequests.status, "pending"))
    .orderBy(asc(featureRequests.createdAt));
}

export async function setFeatureRequestStatus(
  db: DB,
  id: string,
  patch: {
    status: "pending" | "in_progress" | "done" | "rejected";
    implementationNotes?: string;
    prUrl?: string;
    rejectionReason?: string;
    completedAt?: Date;
  },
): Promise<void> {
  await db.update(featureRequests).set(patch).where(eq(featureRequests.id, id));
}

export async function logAudit(
  db: DB,
  entry: {
    actor: string;
    tool: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    success: boolean;
    error?: string;
    durationMs?: number;
  },
) {
  await db.insert(auditLog).values(entry);
}
