// Thin repository functions used by features. Keeps SQL out of feature code.

import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  assertPublicSaleTenantBoundaries,
  requireTenantContext,
  type TenantContext,
} from "../tenancy.js";
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
  commandJobs,
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
  type CommandJob,
} from "./schema.js";

function guardUnscopedCustomerDataAccess(tenant: TenantContext) {
  requireTenantContext(tenant);
  assertPublicSaleTenantBoundaries();
}

export async function insertMessage(db: DB, m: NewMessage) {
  const [row] = await db.insert(messages).values(m).returning();
  return row!;
}

export async function updateMessageTranscript(db: DB, id: string, transcript: string) {
  await db.update(messages).set({ transcript }).where(eq(messages.id, id));
}

export async function updateMessageMetadata(
  db: DB,
  id: string,
  metadata: Record<string, unknown>,
) {
  await db.update(messages).set({ metadata }).where(eq(messages.id, id));
}

/** Delete messages created before `cutoff`. Returns count of deleted rows (best-effort). */
export async function pruneOldMessages(db: DB, cutoff: Date): Promise<number> {
  const result = await db.delete(messages).where(lt(messages.createdAt, cutoff));
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

export async function recentMessages(db: DB, fromNumber: string, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.fromNumber, fromNumber))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

export async function insertMemory(db: DB, tenant: TenantContext, m: NewMemory) {
  guardUnscopedCustomerDataAccess(tenant);
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
  tenant: TenantContext,
  query: string,
  limit = 10,
): Promise<Memory[]> {
  guardUnscopedCustomerDataAccess(tenant);
  const q = `%${query.toLowerCase()}%`;
  return db
    .select()
    .from(memories)
    .where(sql`lower(${memories.content}) LIKE ${q}`)
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

export async function updateMemory(
  db: DB,
  tenant: TenantContext,
  id: string,
  patch: Partial<Pick<NewMemory, "kind" | "content" | "tags">>,
): Promise<Memory | null> {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db.update(memories).set(patch).where(eq(memories.id, id)).returning();
  return row ?? null;
}

export async function deleteMemory(db: DB, tenant: TenantContext, id: string): Promise<boolean> {
  guardUnscopedCustomerDataAccess(tenant);
  const rows = await db.delete(memories).where(eq(memories.id, id)).returning({ id: memories.id });
  return rows.length > 0;
}

export async function insertReminder(db: DB, tenant: TenantContext, r: NewReminder) {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db.insert(reminders).values(r).returning();
  return row!;
}

export async function dueReminders(db: DB, tenant: TenantContext, now: Date): Promise<Reminder[]> {
  guardUnscopedCustomerDataAccess(tenant);
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, "pending"), lte(reminders.fireAt, now)));
}

export async function listPendingReminders(
  db: DB,
  tenant: TenantContext,
  now: Date,
  limit = 5,
): Promise<Reminder[]> {
  guardUnscopedCustomerDataAccess(tenant);
  const rows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.status, "pending"))
    .orderBy(asc(reminders.fireAt))
    .limit(100);

  return rows
    .filter((row) => row.fireAt >= now)
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, limit);
}

export async function markReminderFired(db: DB, tenant: TenantContext, id: string) {
  guardUnscopedCustomerDataAccess(tenant);
  await db.update(reminders).set({ status: "fired" }).where(eq(reminders.id, id));
}

export async function insertExpense(db: DB, tenant: TenantContext, e: NewExpense) {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db.insert(expenses).values(e).returning();
  return row!;
}

export async function expensesBetween(db: DB, tenant: TenantContext, from: Date, to: Date) {
  guardUnscopedCustomerDataAccess(tenant);
  return db
    .select()
    .from(expenses)
    .where(and(gte(expenses.occurredAt, from), lte(expenses.occurredAt, to)));
}

export async function recentExpensesBetween(
  db: DB,
  tenant: TenantContext,
  from: Date,
  to: Date,
  limit = 200,
) {
  guardUnscopedCustomerDataAccess(tenant);
  const rows = await db
    .select()
    .from(expenses)
    .orderBy(desc(expenses.occurredAt))
    .limit(limit);

  return rows.filter((row) => row.occurredAt >= from && row.occurredAt <= to);
}

export async function upsertBrief(db: DB, tenant: TenantContext, forDate: string, body: string) {
  guardUnscopedCustomerDataAccess(tenant);
  await db
    .insert(briefs)
    .values({ forDate, body })
    .onConflictDoUpdate({ target: briefs.forDate, set: { body } });
}

export async function insertConfirmation(
  db: DB,
  tenant: TenantContext,
  action: string,
  payload: Record<string, unknown>,
  expiresAt: Date,
) {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .insert(confirmations)
    .values({ action, payload, expiresAt })
    .returning();
  return row!;
}

export async function setConfirmationStatus(
  db: DB,
  tenant: TenantContext,
  id: string,
  status: "approved" | "rejected" | "expired",
) {
  guardUnscopedCustomerDataAccess(tenant);
  await db.update(confirmations).set({ status }).where(eq(confirmations.id, id));
}

export async function restorePendingConfirmation(db: DB, tenant: TenantContext, id: string) {
  guardUnscopedCustomerDataAccess(tenant);
  await db.update(confirmations).set({ status: "pending" }).where(eq(confirmations.id, id));
}

export async function getLatestPendingConfirmation(db: DB, tenant: TenantContext): Promise<{ id: string; action: string } | null> {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .select()
    .from(confirmations)
    .where(eq(confirmations.status, "pending"))
    .orderBy(desc(confirmations.createdAt))
    .limit(1);
  return row ? { id: row.id, action: row.action } : null;
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

export async function listRecentFeatureRequestsByStatus(
  db: DB,
  status: FeatureRequest["status"],
  limit = 5,
): Promise<FeatureRequest[]> {
  return db
    .select()
    .from(featureRequests)
    .where(eq(featureRequests.status, status))
    .orderBy(desc(featureRequests.completedAt), desc(featureRequests.createdAt))
    .limit(limit);
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
    expectedStatus?: "pending" | "in_progress" | "done" | "rejected";
  },
): Promise<boolean> {
  const { expectedStatus, ...values } = patch;
  const rows = await db
    .update(featureRequests)
    .set(values)
    .where(
      expectedStatus
        ? and(eq(featureRequests.id, id), eq(featureRequests.status, expectedStatus))
        : eq(featureRequests.id, id),
    )
    .returning({ id: featureRequests.id });
  return rows.length > 0;
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

export async function listProfileContextForOwner(
  db: DB,
  ownerHash: string,
  limit = 50,
): Promise<ProfileContext[]> {
  return db
    .select()
    .from(profileContext)
    .where(eq(profileContext.ownerHash, ownerHash))
    .orderBy(desc(profileContext.updatedAt))
    .limit(limit);
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

export async function deleteConnectedAccount(
  db: DB,
  args: {
    provider: ConnectedAccount["provider"];
    ownerHash: string;
    accountLabel?: string;
  },
): Promise<boolean> {
  const rows = await db
    .delete(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.provider, args.provider),
        eq(connectedAccounts.ownerHash, args.ownerHash),
        eq(connectedAccounts.accountLabel, args.accountLabel ?? "default"),
      ),
    )
    .returning({ id: connectedAccounts.id });
  return rows.length > 0;
}

/**
 * Mark all pending confirmations whose expiresAt is before `now` as expired.
 * Returns count of rows updated.
 */
export async function pruneExpiredConfirmations(db: DB, tenant: TenantContext, now: Date = new Date()): Promise<number> {
  guardUnscopedCustomerDataAccess(tenant);
  const rows = await db
    .update(confirmations)
    .set({ status: "expired" })
    .where(and(eq(confirmations.status, "pending"), lt(confirmations.expiresAt, now)))
    .returning({ id: confirmations.id });
  return rows.length;
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

export async function listRecentCommandJobs(
  db: DB,
  args: {
    source?: "whatsapp" | "dashboard";
    limit?: number;
  } = {},
): Promise<CommandJob[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 8, 20));
  const query = db
    .select()
    .from(commandJobs)
    .orderBy(desc(commandJobs.createdAt))
    .limit(limit);

  if (!args.source) return query;
  return db
    .select()
    .from(commandJobs)
    .where(eq(commandJobs.source, args.source))
    .orderBy(desc(commandJobs.createdAt))
    .limit(limit);
}

export async function claimSystemNotification(
  db: DB,
  args: {
    source: string;
    fingerprint: string;
    now: Date;
    cooldownMs: number;
    metadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  const cooldownCutoff = new Date(args.now.getTime() - args.cooldownMs);
  const metadata = JSON.stringify({
    ...(args.metadata ?? {}),
    fingerprint: args.fingerprint,
    notifiedAt: args.now.toISOString(),
    cooldownMs: args.cooldownMs,
  });

  const rows = await db.execute(sql`
    INSERT INTO system_heartbeats (source, status, last_seen_at, metadata, updated_at)
    VALUES (${args.source}, 'ok', ${args.now}, ${metadata}::jsonb, NOW())
    ON CONFLICT (source)
    DO UPDATE SET
      status = 'ok',
      last_seen_at = EXCLUDED.last_seen_at,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    WHERE
      COALESCE(system_heartbeats.metadata->>'fingerprint', '') <> ${args.fingerprint}
      OR COALESCE((system_heartbeats.metadata->>'notifiedAt')::timestamptz, 'epoch'::timestamptz) <= ${cooldownCutoff}
    RETURNING source
  `);

  return Array.isArray(rows)
    ? rows.length > 0
    : Array.isArray((rows as { rows?: unknown[] }).rows)
      ? ((rows as { rows?: unknown[] }).rows?.length ?? 0) > 0
      : Number((rows as { rowCount?: number }).rowCount ?? 0) > 0;
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
const MAX_AUDIT_OBJECT_KEYS = 25;
const AUDIT_OBJECT_SAMPLE_KEYS = 8;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]?){8,}\d/g;
const TOKEN_RE = /\b(?:(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{8,}|(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g;

export function redactAuditString(value: string): string {
  const redacted = value
    .replace(EMAIL_RE, "[redacted:email]")
    .replace(TOKEN_RE, "[redacted:token]")
    .replace(PHONE_RE, "[redacted:phone]");
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
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_AUDIT_OBJECT_KEYS) {
      return {
        count: entries.length,
        sample: sanitizeAuditValue(Object.fromEntries(entries.slice(0, AUDIT_OBJECT_SAMPLE_KEYS))),
      };
    }
    for (const [key, child] of entries) {
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
