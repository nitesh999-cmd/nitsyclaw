// Thin repository functions used by features. Keeps SQL out of feature code.

import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  assertPublicSaleTenantBoundaries,
  requireTenantContext,
  type TenantContext,
} from "../tenancy.js";
import type { SafeAuditEntry } from "./audit-contract.js";
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
  dailyFocus,
  snoozes,
  entities,
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
  type EntityKind,
} from "./schema.js";

function guardUnscopedCustomerDataAccess(tenant: TenantContext) {
  const context = requireTenantContext(tenant);
  assertPublicSaleTenantBoundaries();
  return context;
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
  const context = guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db.insert(memories).values({ ...m, ownerHash: context.ownerHash }).returning();
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
  const context = guardUnscopedCustomerDataAccess(tenant);
  const q = `%${query.toLowerCase()}%`;
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.ownerHash, context.ownerHash), sql`lower(${memories.content}) LIKE ${q}`))
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

export async function updateMemory(
  db: DB,
  tenant: TenantContext,
  id: string,
  patch: Partial<Pick<NewMemory, "kind" | "content" | "tags">>,
): Promise<Memory | null> {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .update(memories)
    .set(patch)
    .where(and(eq(memories.id, id), eq(memories.ownerHash, context.ownerHash)))
    .returning();
  return row ?? null;
}

export async function deleteMemory(db: DB, tenant: TenantContext, id: string): Promise<boolean> {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const rows = await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.ownerHash, context.ownerHash)))
    .returning({ id: memories.id });
  return rows.length > 0;
}

export async function insertReminder(db: DB, tenant: TenantContext, r: NewReminder) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db.insert(reminders).values({ ...r, ownerHash: context.ownerHash }).returning();
  return row!;
}

export async function dueReminders(db: DB, tenant: TenantContext, now: Date): Promise<Reminder[]> {
  const context = guardUnscopedCustomerDataAccess(tenant);
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.ownerHash, context.ownerHash), eq(reminders.status, "pending"), lte(reminders.fireAt, now)));
}

export async function listPendingReminders(
  db: DB,
  tenant: TenantContext,
  now: Date,
  limit = 5,
): Promise<Reminder[]> {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const rows = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.ownerHash, context.ownerHash), eq(reminders.status, "pending")))
    .orderBy(asc(reminders.fireAt))
    .limit(100);

  return rows
    .filter((row) => row.fireAt >= now)
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, limit);
}

export async function markReminderFired(db: DB, tenant: TenantContext, id: string) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  await db
    .update(reminders)
    .set({ status: "fired" })
    .where(and(eq(reminders.id, id), eq(reminders.ownerHash, context.ownerHash)));
}

export async function cancelReminder(db: DB, tenant: TenantContext, id: string) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  await db
    .update(reminders)
    .set({ status: "cancelled" })
    .where(and(eq(reminders.id, id), eq(reminders.ownerHash, context.ownerHash)));
}

export async function rescheduleReminder(db: DB, tenant: TenantContext, id: string, fireAt: Date) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  await db
    .update(reminders)
    .set({ status: "pending", fireAt })
    .where(and(eq(reminders.id, id), eq(reminders.ownerHash, context.ownerHash)));
}

export async function insertExpense(db: DB, tenant: TenantContext, e: NewExpense) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db.insert(expenses).values({ ...e, ownerHash: context.ownerHash }).returning();
  return row!;
}

export async function expensesBetween(db: DB, tenant: TenantContext, from: Date, to: Date) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  return db
    .select()
    .from(expenses)
    .where(and(eq(expenses.ownerHash, context.ownerHash), gte(expenses.occurredAt, from), lte(expenses.occurredAt, to)));
}

export async function recentExpensesBetween(
  db: DB,
  tenant: TenantContext,
  from: Date,
  to: Date,
  limit = 200,
) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.ownerHash, context.ownerHash), gte(expenses.occurredAt, from), lte(expenses.occurredAt, to)))
    .orderBy(desc(expenses.occurredAt))
    .limit(limit);

  return rows;
}

export async function upsertBrief(db: DB, tenant: TenantContext, forDate: string, body: string) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  await db
    .insert(briefs)
    .values({ ownerHash: context.ownerHash, forDate, body })
    .onConflictDoUpdate({ target: [briefs.ownerHash, briefs.forDate], set: { body } });
}

export async function insertConfirmation(
  db: DB,
  tenant: TenantContext,
  action: string,
  payload: Record<string, unknown>,
  expiresAt: Date,
) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .insert(confirmations)
    .values({ ownerHash: context.ownerHash, action, payload, expiresAt })
    .returning();
  return row!;
}

export async function setConfirmationStatus(
  db: DB,
  tenant: TenantContext,
  id: string,
  status: "approved" | "rejected" | "expired",
) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  await db
    .update(confirmations)
    .set({ status })
    .where(and(eq(confirmations.id, id), eq(confirmations.ownerHash, context.ownerHash)));
}

export async function restorePendingConfirmation(db: DB, tenant: TenantContext, id: string) {
  const context = guardUnscopedCustomerDataAccess(tenant);
  await db
    .update(confirmations)
    .set({ status: "pending" })
    .where(and(eq(confirmations.id, id), eq(confirmations.ownerHash, context.ownerHash)));
}

export async function getLatestPendingConfirmation(
  db: DB,
  tenant: TenantContext,
): Promise<{ id: string; action: string; status: string; expiresAt: Date; payload: Record<string, unknown> } | null> {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .select()
    .from(confirmations)
    .where(and(eq(confirmations.ownerHash, context.ownerHash), eq(confirmations.status, "pending")))
    .orderBy(desc(confirmations.createdAt))
    .limit(1);
  return row
    ? {
        id: row.id,
        action: row.action,
        status: row.status,
        expiresAt: row.expiresAt,
        payload: row.payload as Record<string, unknown>,
      }
    : null;
}

export async function getPendingConfirmationById(
  db: DB,
  tenant: TenantContext,
  id: string,
): Promise<{ id: string; action: string; status: string; expiresAt: Date; payload: Record<string, unknown> } | null> {
  const context = guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .select()
    .from(confirmations)
    .where(and(eq(confirmations.id, id), eq(confirmations.ownerHash, context.ownerHash)))
    .limit(1);
  return row
    ? {
        id: row.id,
        action: row.action,
        status: row.status,
        expiresAt: row.expiresAt,
        payload: row.payload as Record<string, unknown>,
      }
    : null;
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
  const context = guardUnscopedCustomerDataAccess(tenant);
  const rows = await db
    .update(confirmations)
    .set({ status: "expired" })
    .where(and(eq(confirmations.ownerHash, context.ownerHash), eq(confirmations.status, "pending"), lt(confirmations.expiresAt, now)))
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
    ownerHash?: string;
    limit?: number;
  } = {},
): Promise<CommandJob[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 8, 20));
  const filters = [
    args.source ? eq(commandJobs.source, args.source) : undefined,
    args.ownerHash ? eq(commandJobs.ownerHash, args.ownerHash) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));

  const query = db
    .select()
    .from(commandJobs)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(commandJobs.createdAt))
    .limit(limit);

  return query;
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

/**
 * The only path to `audit_log`.
 *
 * The parameter type is branded, so a caller cannot pass an object literal
 * assembled from runtime data: every row is shaped by a builder in
 * `audit-contract.ts` that copies approved fields individually. The sanitizer
 * below remains as a second layer of defence, not as the first one.
 */
export async function logAudit(db: DB, entry: SafeAuditEntry) {
  await db.insert(auditLog).values(safeAuditValues(entry));
}

/**
 * The insert values for a contract-built entry.
 *
 * Exported for the one writer that must insert inside an existing transaction
 * rather than on its own connection — it still cannot assemble a row by hand,
 * because it can only obtain a `SafeAuditEntry` from a contract builder.
 */
export function safeAuditValues(entry: SafeAuditEntry) {
  return {
    actor: entry.actor,
    tool: entry.tool,
    input: sanitizeAuditPayload(entry.input),
    output: sanitizeAuditPayload(entry.output),
    success: entry.success,
    error: entry.error ? redactAuditString(entry.error) : undefined,
    durationMs: entry.durationMs,
  };
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

// ===== Daily Focus (Feature 25) =====

export async function proposeDailyFocus(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; forDate: string; candidates: string[] },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const trimmed = args.candidates.map((c) => c.trim()).filter(Boolean).slice(0, 5);
  const existing = await getDailyFocus(db, tenant, args);
  if (existing) {
    await db
      .update(dailyFocus)
      .set({ candidates: trimmed })
      .where(and(eq(dailyFocus.ownerHash, args.ownerHash), eq(dailyFocus.forDate, args.forDate)));
  } else {
    await db
      .insert(dailyFocus)
      .values({ ownerHash: args.ownerHash, forDate: args.forDate, candidates: trimmed });
  }
  const row = await getDailyFocus(db, tenant, args);
  return row!;
}

export async function pickDailyFocus(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; forDate: string; chosenText: string; now: Date },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const chosen = args.chosenText.trim().slice(0, 200);
  if (!chosen) throw new Error("chosenText is required");
  const existing = await getDailyFocus(db, tenant, args);
  if (existing) {
    await db
      .update(dailyFocus)
      .set({ chosenText: chosen, chosenAt: args.now })
      .where(and(eq(dailyFocus.ownerHash, args.ownerHash), eq(dailyFocus.forDate, args.forDate)));
  } else {
    await db.insert(dailyFocus).values({
      ownerHash: args.ownerHash,
      forDate: args.forDate,
      candidates: [],
      chosenText: chosen,
      chosenAt: args.now,
    });
  }
  const row = await getDailyFocus(db, tenant, args);
  return row!;
}

export async function markDailyFocusDone(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; forDate: string; now: Date },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .update(dailyFocus)
    .set({ completedAt: args.now })
    .where(and(eq(dailyFocus.ownerHash, args.ownerHash), eq(dailyFocus.forDate, args.forDate)))
    .returning();
  return row ?? null;
}

export async function getDailyFocus(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; forDate: string },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .select()
    .from(dailyFocus)
    .where(and(eq(dailyFocus.ownerHash, args.ownerHash), eq(dailyFocus.forDate, args.forDate)))
    .limit(1);
  return row ?? null;
}

// ===== Entity graph substrate (Feature 28) =====

/** Helper for auto-extract worker: messages with no entity rows pointing at them. */
export async function recentMessagesWithoutEntities(
  db: DB,
  args: { ownerPhoneHash: string; sinceMs: number; limit?: number },
) {
  // No tenant guard: scheduler reads its own owner via ownerPhoneHash.
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const since = new Date(Date.now() - args.sinceMs);
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.fromNumber, args.ownerPhoneHash), gte(messages.createdAt, since)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  // Filter out ones that already have entities (single-query approach for fake-DB friendliness).
  const out: typeof rows = [];
  for (const m of rows) {
    const existing = await db
      .select()
      .from(entities)
      .where(and(eq(entities.sourceTable, "messages"), eq(entities.sourceId, m.id)))
      .limit(1);
    if (existing.length === 0) out.push(m);
  }
  return out;
}

export interface EntityRecordInput {
  ownerHash: string;
  kind: EntityKind;
  value: string;
  sourceTable?: string;
  sourceId?: string;
  sourceAt?: Date;
}

function normalizeEntityValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 200);
}

export async function insertEntities(
  db: DB,
  tenant: TenantContext,
  rows: EntityRecordInput[],
) {
  guardUnscopedCustomerDataAccess(tenant);
  if (!rows.length) return [];
  const inserted = await db
    .insert(entities)
    .values(
      rows.map((r) => ({
        ownerHash: r.ownerHash,
        kind: r.kind,
        value: r.value.trim().slice(0, 500),
        normalizedValue: normalizeEntityValue(r.value),
        sourceTable: r.sourceTable,
        sourceId: r.sourceId,
        sourceAt: r.sourceAt,
      })),
    )
    .returning();
  return inserted;
}

/**
 * Auto-extract (Feature 30) writes a `__none__<messageId>` sentinel entity
 * when an LLM pass found nothing, so the same message isn't re-scanned every
 * tick. That sentinel must never surface to a user-facing read — filter it
 * out here at the source so every caller (find_entities, recent_entities_by_kind,
 * and any future reader) gets it for free instead of each having to remember.
 */
const NOT_SENTINEL_ENTITY = sql`${entities.normalizedValue} NOT LIKE '\\_\\_none\\_\\_%' ESCAPE '\\'`;

export async function findEntities(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; query: string; kind?: EntityKind; limit?: number },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const normalized = normalizeEntityValue(args.query);
  const pattern = `%${normalized}%`;
  const conds = [
    eq(entities.ownerHash, args.ownerHash),
    sql`${entities.normalizedValue} ILIKE ${pattern}`,
    NOT_SENTINEL_ENTITY,
  ];
  if (args.kind) conds.push(eq(entities.kind, args.kind));
  return await db
    .select()
    .from(entities)
    .where(and(...conds))
    .orderBy(desc(entities.createdAt))
    .limit(limit);
}

export async function entitiesForSource(
  db: DB,
  tenant: TenantContext,
  args: { sourceTable: string; sourceId: string },
) {
  guardUnscopedCustomerDataAccess(tenant);
  return await db
    .select()
    .from(entities)
    .where(and(eq(entities.sourceTable, args.sourceTable), eq(entities.sourceId, args.sourceId)));
}

export async function recentEntitiesByKind(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; kind: EntityKind; limit?: number },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 200);
  return await db
    .select()
    .from(entities)
    .where(and(eq(entities.ownerHash, args.ownerHash), eq(entities.kind, args.kind), NOT_SENTINEL_ENTITY))
    .orderBy(desc(entities.createdAt))
    .limit(limit);
}

// ===== Contact Timeline (Feature 29 — joins entity graph back to sources) =====

export interface ContactTimelineHit {
  /** the table the source row lives in */
  sourceTable: string;
  sourceId: string;
  /** when the source occurred (createdAt or occurredAt depending on table) */
  at: Date;
  /** short human preview */
  preview: string;
  /** original contact entity that anchored the hit */
  contactValue: string;
}

/**
 * Find all source rows tied to a given contact name (or substring).
 * Resolution path:
 *   1. find_entities where kind='person' and normalized_value ILIKE query
 *   2. for each matching entity row, look up the source row in its
 *      origin table (messages, memories, expenses, reminders) and merge
 *      chronologically.
 * Pure read-side. No new data needed beyond what's already in the entities
 * table + the four history surfaces.
 */
export async function contactTimeline(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; contactQuery: string; limit?: number },
): Promise<ContactTimelineHit[]> {
  guardUnscopedCustomerDataAccess(tenant);
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const pattern = `%${args.contactQuery.replace(/\s+/g, " ").trim().toLowerCase()}%`;

  // Step 1: get matching person entities (broad over-fetch so we find sources).
  const matchedEntities = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.ownerHash, args.ownerHash),
        eq(entities.kind, "person"),
        sql`${entities.normalizedValue} ILIKE ${pattern}`,
      ),
    )
    .orderBy(desc(entities.createdAt))
    .limit(limit * 3);

  if (!matchedEntities.length) return [];

  // Group by source row to avoid dupes; pick best contact value to display.
  const sourceMap = new Map<string, { contactValue: string }>();
  for (const e of matchedEntities) {
    if (!e.sourceTable || !e.sourceId) continue;
    const key = `${e.sourceTable}:${e.sourceId}`;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { contactValue: e.value });
    }
  }

  // Step 2: hydrate source rows in parallel by table.
  const byTable = new Map<string, Array<{ id: string; contactValue: string }>>();
  for (const [key, { contactValue }] of sourceMap) {
    const [table, id] = key.split(":");
    if (!table || !id) continue;
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table)!.push({ id, contactValue });
  }

  const previewOf = (text: string | null | undefined, max = 140): string => {
    if (!text) return "";
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
  };

  const hits: ContactTimelineHit[] = [];

  const messageIds = byTable.get("messages")?.map((r) => r.id) ?? [];
  if (messageIds.length) {
    const rows = await db.select().from(messages).where(sql`${messages.id} = ANY(${messageIds})`);
    for (const m of rows) {
      const meta = byTable.get("messages")!.find((r) => r.id === m.id)!;
      hits.push({
        sourceTable: "messages",
        sourceId: m.id,
        at: m.createdAt,
        preview: previewOf(m.transcript || m.body),
        contactValue: meta.contactValue,
      });
    }
  }

  const memIds = byTable.get("memories")?.map((r) => r.id) ?? [];
  if (memIds.length) {
    const rows = await db
      .select()
      .from(memories)
      .where(and(eq(memories.ownerHash, args.ownerHash), sql`${memories.id} = ANY(${memIds})`));
    for (const m of rows) {
      const meta = byTable.get("memories")!.find((r) => r.id === m.id)!;
      hits.push({
        sourceTable: "memories",
        sourceId: m.id,
        at: m.createdAt,
        preview: previewOf(m.content),
        contactValue: meta.contactValue,
      });
    }
  }

  const expIds = byTable.get("expenses")?.map((r) => r.id) ?? [];
  if (expIds.length) {
    const rows = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.ownerHash, args.ownerHash), sql`${expenses.id} = ANY(${expIds})`));
    for (const e of rows) {
      const meta = byTable.get("expenses")!.find((r) => r.id === e.id)!;
      const amount = (e.amount / 100).toFixed(2);
      hits.push({
        sourceTable: "expenses",
        sourceId: e.id,
        at: e.occurredAt,
        preview: `${e.merchant ?? e.category} ${amount} ${e.currency}`,
        contactValue: meta.contactValue,
      });
    }
  }

  const remIds = byTable.get("reminders")?.map((r) => r.id) ?? [];
  if (remIds.length) {
    const rows = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.ownerHash, args.ownerHash), sql`${reminders.id} = ANY(${remIds})`));
    for (const r of rows) {
      const meta = byTable.get("reminders")!.find((row) => row.id === r.id)!;
      hits.push({
        sourceTable: "reminders",
        sourceId: r.id,
        at: r.createdAt,
        preview: previewOf(r.text),
        contactValue: meta.contactValue,
      });
    }
  }

  hits.sort((a, b) => b.at.getTime() - a.at.getTime());
  return hits.slice(0, limit);
}

// ===== Cross-table "last time" recall (Feature 27) =====

export interface RecallHit {
  kind: "message" | "memory" | "expense" | "reminder";
  id: string;
  at: Date;
  preview: string;
  /** secondary detail when useful (e.g. merchant for expense, source for message) */
  context?: string;
}

/**
 * Plain ILIKE search across the four "personal history" surfaces, merged
 * into one chronological list. Single-owner mode: filters by owner_hash
 * for owned tables (memories/expenses/reminders) and by fromNumber for
 * messages. No embeddings yet — pure text match.
 */
export async function recallAcrossSurfaces(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; ownerPhoneHash: string; query: string; limit?: number },
): Promise<RecallHit[]> {
  guardUnscopedCustomerDataAccess(tenant);
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
  const pattern = `%${args.query.trim().replace(/[%_]/g, " ")}%`;

  const [msgRows, memRows, expRows, remRows] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.fromNumber, args.ownerPhoneHash),
          sql`(${messages.body} ILIKE ${pattern} OR ${messages.transcript} ILIKE ${pattern})`,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit),
    db
      .select()
      .from(memories)
      .where(and(eq(memories.ownerHash, args.ownerHash), sql`${memories.content} ILIKE ${pattern}`))
      .orderBy(desc(memories.createdAt))
      .limit(limit),
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.ownerHash, args.ownerHash),
          sql`(${expenses.merchant} ILIKE ${pattern} OR ${expenses.notes} ILIKE ${pattern} OR ${expenses.category} ILIKE ${pattern})`,
        ),
      )
      .orderBy(desc(expenses.occurredAt))
      .limit(limit),
    db
      .select()
      .from(reminders)
      .where(and(eq(reminders.ownerHash, args.ownerHash), sql`${reminders.text} ILIKE ${pattern}`))
      .orderBy(desc(reminders.createdAt))
      .limit(limit),
  ]);

  const previewOf = (text: string | null | undefined, max = 140): string => {
    if (!text) return "";
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
  };

  const hits: RecallHit[] = [];
  for (const m of msgRows) {
    hits.push({
      kind: "message",
      id: m.id,
      at: m.createdAt,
      preview: previewOf(m.transcript || m.body),
      context: m.direction === "in" ? "from you" : "from NitsyClaw",
    });
  }
  for (const m of memRows) {
    hits.push({ kind: "memory", id: m.id, at: m.createdAt, preview: previewOf(m.content), context: m.kind });
  }
  for (const e of expRows) {
    const amount = (e.amount / 100).toFixed(2);
    hits.push({
      kind: "expense",
      id: e.id,
      at: e.occurredAt,
      preview: `${e.merchant ?? e.category} ${amount} ${e.currency}`,
      context: e.category,
    });
  }
  for (const r of remRows) {
    hits.push({
      kind: "reminder",
      id: r.id,
      at: r.createdAt,
      preview: previewOf(r.text),
      context: r.status,
    });
  }
  hits.sort((a, b) => b.at.getTime() - a.at.getTime());
  return hits.slice(0, limit);
}

// ===== Snooze-and-resurface (Feature 26) =====

export async function insertSnooze(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; content: string; sourceHint?: string; draftReply?: string; resurfaceAt: Date },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const [row] = await db
    .insert(snoozes)
    .values({
      ownerHash: args.ownerHash,
      content: args.content,
      sourceHint: args.sourceHint,
      draftReply: args.draftReply,
      resurfaceAt: args.resurfaceAt,
    })
    .returning();
  return row!;
}

export async function dueSnoozes(db: DB, now: Date, limit = 20, ownerHash?: string) {
  // No tenant guard: scheduler-side fan-out. `ownerHash` is optional today
  // because the system is single-owner (Constitution R2) — the one caller
  // (fireDueSnoozes) always passes it, scoping the read so a future
  // multi-owner deployment can't have one owner's snooze delivered to
  // another owner's WhatsApp (the caller sends every returned row to a
  // single `ownerPhone` argument, so an unscoped read here would silently
  // cross tenant boundaries the moment there is more than one owner).
  const conds = [eq(snoozes.status, "pending"), lte(snoozes.resurfaceAt, now)];
  if (ownerHash) conds.push(eq(snoozes.ownerHash, ownerHash));
  const rows = await db
    .select()
    .from(snoozes)
    .where(and(...conds))
    .limit(limit);
  return rows;
}

export async function markSnoozeResurfaced(db: DB, tenant: TenantContext, id: string) {
  guardUnscopedCustomerDataAccess(tenant);
  await db.update(snoozes).set({ status: "resurfaced" }).where(eq(snoozes.id, id));
}

/**
 * Matches by full UUID OR by the 8-char prefix the resurface message
 * actually tells the user to reply with (`cancel snooze <id.slice(0,8)>`).
 * Previously this only did full-UUID equality, so the exact command the bot
 * instructed the user to type could never match. Scoped to this owner's
 * pending snoozes, so a short prefix collision is not a cross-user risk.
 */
export async function cancelSnooze(db: DB, tenant: TenantContext, args: { id: string; ownerHash: string }) {
  guardUnscopedCustomerDataAccess(tenant);
  const idMatch =
    args.id.length >= 8 && args.id.length < 36
      ? sql`${snoozes.id}::text LIKE ${args.id.toLowerCase() + "%"}`
      : eq(snoozes.id, args.id);
  const updated = await db
    .update(snoozes)
    .set({ status: "cancelled" })
    .where(and(idMatch, eq(snoozes.ownerHash, args.ownerHash), eq(snoozes.status, "pending")))
    .returning();
  return updated[0] ?? null;
}

export async function listMyPendingSnoozes(
  db: DB,
  tenant: TenantContext,
  args: { ownerHash: string; limit?: number },
) {
  guardUnscopedCustomerDataAccess(tenant);
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  return await db
    .select()
    .from(snoozes)
    .where(and(eq(snoozes.ownerHash, args.ownerHash), eq(snoozes.status, "pending")))
    .orderBy(asc(snoozes.resurfaceAt))
    .limit(limit);
}
