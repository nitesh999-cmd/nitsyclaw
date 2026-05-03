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
  profileContext,
  connectedAccounts,
  systemHeartbeats,
  type NewMessage,
  type NewMemory,
  type NewReminder,
  type NewExpense,
  type Reminder,
  type Memory,
  type NewFeatureRequest,
  type FeatureRequest,
  type ProfileContext,
  type NewProfileContext,
  type ConnectedAccount,
  type NewConnectedAccount,
  type SystemHeartbeat,
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

export async function upsertProfileContext(
  db: DB,
  ctx: NewProfileContext,
): Promise<ProfileContext> {
  const [existing] = await db
    .select()
    .from(profileContext)
    .where(and(eq(profileContext.ownerHash, ctx.ownerHash ?? "owner"), eq(profileContext.key, ctx.key)))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(profileContext)
      .set({ ...ctx, updatedAt: new Date() })
      .where(eq(profileContext.id, existing.id))
      .returning();
    return row!;
  }

  const [row] = await db.insert(profileContext).values(ctx).returning();
  return row!;
}

export async function getProfileContext(
  db: DB,
  args: { ownerHash: string; key: string },
): Promise<ProfileContext | null> {
  const [row] = await db
    .select()
    .from(profileContext)
    .where(and(eq(profileContext.ownerHash, args.ownerHash), eq(profileContext.key, args.key)))
    .limit(1);
  return row ?? null;
}

export async function upsertConnectedAccount(
  db: DB,
  account: NewConnectedAccount,
): Promise<ConnectedAccount> {
  const [existing] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.provider, account.provider),
        eq(connectedAccounts.ownerHash, account.ownerHash),
        eq(connectedAccounts.accountLabel, account.accountLabel ?? "default"),
      ),
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(connectedAccounts)
      .set({ ...account, updatedAt: new Date() })
      .where(eq(connectedAccounts.id, existing.id))
      .returning();
    return row!;
  }

  const [row] = await db.insert(connectedAccounts).values(account).returning();
  return row!;
}

export async function getConnectedAccount(
  db: DB,
  args: {
    provider: ConnectedAccount["provider"];
    ownerHash: string;
    accountLabel?: string;
  },
): Promise<ConnectedAccount | null> {
  const [row] = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.provider, args.provider),
        eq(connectedAccounts.ownerHash, args.ownerHash),
        eq(connectedAccounts.accountLabel, args.accountLabel ?? "default"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertSystemHeartbeat(
  db: DB,
  args: {
    source: string;
    status?: string;
    lastSeenAt?: Date;
    metadata?: Record<string, unknown>;
  },
): Promise<SystemHeartbeat> {
  const [row] = await db
    .insert(systemHeartbeats)
    .values({
      source: args.source,
      status: args.status ?? "ok",
      lastSeenAt: args.lastSeenAt ?? new Date(),
      metadata: args.metadata ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemHeartbeats.source,
      set: {
        status: args.status ?? "ok",
        lastSeenAt: args.lastSeenAt ?? new Date(),
        metadata: args.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function getSystemHeartbeat(
  db: DB,
  source: string,
): Promise<SystemHeartbeat | null> {
  const [row] = await db
    .select()
    .from(systemHeartbeats)
    .where(eq(systemHeartbeats.source, source))
    .limit(1);
  return row ?? null;
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
  await db.insert(auditLog).values({
    ...entry,
    input: sanitizeAuditPayload(entry.input),
    output: sanitizeAuditPayload(entry.output),
    error: entry.error ? redactAuditString(entry.error) : undefined,
  });
}

const SENSITIVE_KEY_RE = /(token|secret|password|credential|authorization|cookie|body|content|message|email|phone|number|address|location|transcript|payload|refresh|access)/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]?){8,}\d/g;
const TOKEN_RE = /\b(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,}\b/g;

function redactAuditString(value: string): string {
  const redacted = value
    .replace(EMAIL_RE, "[redacted:email]")
    .replace(PHONE_RE, "[redacted:phone]")
    .replace(TOKEN_RE, "[redacted:token]");
  return redacted.length > 160 ? `${redacted.slice(0, 160)}...[truncated]` : redacted;
}

export function sanitizeAuditPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return sanitizeAuditValue(value) as Record<string, unknown>;
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactAuditString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.length > 10) {
      return { count: value.length, sample: value.slice(0, 3).map(sanitizeAuditValue) };
    }
    return value.map(sanitizeAuditValue);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeAuditValue(child);
      }
    }
    return out;
  }
  return "[redacted]";
}
