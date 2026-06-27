// Drizzle schema — single source of truth (Constitution R5).
// All NitsyClaw state lives here.

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Every WhatsApp message in or out. Foundation for the conversation log.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    surface: text("surface", { enum: ["whatsapp", "dashboard"] }).notNull().default("whatsapp"),
    waMessageId: text("wa_message_id"),
    fromNumber: text("from_number").notNull(),
    body: text("body").notNull().default(""), // encrypted at rest (R6)
    mediaType: text("media_type"), // 'image' | 'voice' | 'document' | null
    mediaPath: text("media_path"),
    transcript: text("transcript"),
    intent: text("intent"), // matched intent name
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    fromIdx: index("messages_from_idx").on(t.fromNumber),
    createdIdx: index("messages_created_idx").on(t.createdAt),
    surfaceCreatedIdx: index("messages_surface_created_idx").on(t.surface, t.createdAt),
  }),
);

/**
 * Long-term memory entries. Embedded with pgvector dim=1536 (OpenAI text-embedding-3-small).
 * pgvector column added via raw SQL migration; Drizzle treats it as text for now.
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind", { enum: ["fact", "note", "pin", "summary"] }).notNull(),
    content: text("content").notNull(),
    tags: text("tags").array().default([]).notNull(),
    embedding: text("embedding"), // vector(1536) — set in migration
    sourceMessageId: uuid("source_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindIdx: index("memories_kind_idx").on(t.kind),
  }),
);

/**
 * Reminders — one-shot or recurring.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    text: text("text").notNull(),
    fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
    rrule: text("rrule"), // null = one-shot; iCal RRULE for recurring
    status: text("status", { enum: ["pending", "fired", "cancelled"] }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    fireIdx: index("reminders_fire_idx").on(t.fireAt),
    statusIdx: index("reminders_status_idx").on(t.status),
  }),
);

/**
 * Expenses logged from receipt photos or text.
 */
export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  amount: integer("amount_cents").notNull(), // store cents to avoid float
  currency: text("currency").notNull().default("AUD"),
  category: text("category").notNull(),
  merchant: text("merchant"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  sourceMessageId: uuid("source_message_id"),
  receiptPath: text("receipt_path"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Daily morning briefs — one row per day.
 */
export const briefs = pgTable("briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  forDate: text("for_date").notNull().unique(), // 'YYYY-MM-DD'
  body: text("body").notNull(),
  delivered: boolean("delivered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Entity graph (Feature 28 substrate). Typed entities extracted from
 * user history -- people, places, money mentions, dates, topics, orgs,
 * URLs. Normalised_value is lowercased + trimmed for ILIKE-friendly
 * lookups. source_table + source_id let a hit cite back to its origin
 * row (message, memory, expense, reminder, email, etc.).
 *
 * Embeddings + automatic extraction from insertMessage are next-session
 * work; this table is the foundation both layer on top of.
 */
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerHash: text("owner_hash").notNull().default("owner"),
    kind: text("kind", { enum: ["person", "place", "money", "date", "topic", "org", "url"] }).notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    sourceTable: text("source_table"),
    sourceId: text("source_id"),
    sourceAt: timestamp("source_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerKindIdx: index("entities_owner_kind_idx").on(t.ownerHash, t.kind),
    normalizedIdx: index("entities_normalized_idx").on(t.normalizedValue),
    sourceIdx: index("entities_source_idx").on(t.sourceTable, t.sourceId),
  }),
);

/**
 * Snooze-and-resurface (Feature 26). Save any text + a resurface time; bot
 * pings the user at that time with the content and an optional pre-drafted
 * reply. Pattern mirrors reminders but body is free-form and optionally
 * includes the original thread context for one-tap action.
 */
export const snoozes = pgTable(
  "snoozes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerHash: text("owner_hash").notNull().default("owner"),
    content: text("content").notNull(), // original message / email / note
    sourceHint: text("source_hint"), // e.g. "Sarah - Q3 numbers thread"
    draftReply: text("draft_reply"), // pre-written reply for one-tap send
    resurfaceAt: timestamp("resurface_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["pending", "resurfaced", "cancelled"] }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusResurfaceIdx: index("snoozes_status_resurface_idx").on(t.status, t.resurfaceAt),
    ownerStatusIdx: index("snoozes_owner_status_idx").on(t.ownerHash, t.status),
  }),
);

/**
 * Daily Focus Theme (Feature 25). One ONE-thing per owner per day.
 * Morning brief proposes candidates; user picks; drift-detector + evening
 * close read this row to nudge / report. Unique on (owner_hash, for_date).
 */
export const dailyFocus = pgTable(
  "daily_focus",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerHash: text("owner_hash").notNull().default("owner"),
    forDate: text("for_date").notNull(), // 'YYYY-MM-DD' in owner timezone
    candidates: jsonb("candidates").$type<string[]>().default([]).notNull(),
    chosenText: text("chosen_text"), // null until user picks
    chosenAt: timestamp("chosen_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerDateUniqueIdx: uniqueIndex("daily_focus_owner_date_unique_idx").on(t.ownerHash, t.forDate),
  }),
);

/**
 * Pending confirmations — destructive actions wait here for y/n.
 */
export const confirmations = pgTable("confirmations", {
  id: uuid("id").defaultRandom().primaryKey(),
  action: text("action").notNull(), // e.g. 'send_email', 'create_calendar_event'
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected", "expired"] }).notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Audit log — every tool call the agent makes. R6 + R15 require this.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actor: text("actor").notNull(), // 'agent' | 'cron' | 'user'
    tool: text("tool").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().default({}),
    success: boolean("success").notNull(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    toolIdx: index("audit_tool_idx").on(t.tool),
    createdIdx: index("audit_created_idx").on(t.createdAt),
  }),
);

/**
 * Feature requests captured from WhatsApp/dashboard via the `request_feature` tool.
 * Processed by a scheduled CCR routine that runs NWP and implements them.
 * Single source of truth for "what does Nitesh want next?" (R5 + R32).
 */
export const featureRequests = pgTable(
  "feature_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    description: text("description").notNull(),
    type: text("type", { enum: ["feature", "bug"] }).notNull().default("feature"),
    severity: text("severity", { enum: ["P0", "P1", "P2", "P3"] }),
    size: text("size", { enum: ["S", "M", "L"] }).notNull().default("M"),
    status: text("status", { enum: ["pending", "in_progress", "done", "rejected"] })
      .notNull()
      .default("pending"),
    source: text("source", { enum: ["whatsapp", "dashboard"] }).notNull(),
    requestedBy: text("requested_by"), // hashed phone or "owner"
    implementationNotes: text("implementation_notes"),
    prUrl: text("pr_url"),
    rejectionReason: text("rejection_reason"),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("feature_requests_status_idx").on(t.status, t.createdAt),
  }),
);

/**
 * Small structured profile/context state used for active routing decisions.
 * This is distinct from free-form memories because values can expire and
 * should be overwritten predictably.
 */
export const profileContext = pgTable(
  "profile_context",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerHash: text("owner_hash").notNull().default("owner"),
    key: text("key").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    source: text("source").notNull().default("manual"),
    sensitivity: text("sensitivity", { enum: ["normal", "personal", "sensitive"] })
      .notNull()
      .default("personal"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerKeyUniqueIdx: uniqueIndex("profile_context_owner_key_unique_idx").on(t.ownerHash, t.key),
    keyIdx: index("profile_context_key_idx").on(t.key),
  }),
);

/**
 * OAuth/API accounts connected by the owner.
 * Tokens are encrypted by caller before insert/update.
 */
export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider", { enum: ["spotify"] }).notNull(),
    ownerHash: text("owner_hash").notNull(),
    accountLabel: text("account_label").notNull().default("default"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    scope: text("scope").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    providerOwnerIdx: index("connected_accounts_provider_owner_idx").on(
      t.provider,
      t.ownerHash,
      t.accountLabel,
    ),
    providerOwnerUniqueIdx: uniqueIndex("connected_accounts_provider_owner_unique_idx").on(
      t.provider,
      t.ownerHash,
      t.accountLabel,
    ),
  }),
);

/**
 * Lightweight operational heartbeat table.
 * Local processes write here so the dashboard can detect alive-but-stale states.
 */
export const systemHeartbeats = pgTable(
  "system_heartbeats",
  {
    source: text("source").primaryKey(),
    status: text("status").notNull().default("ok"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

/**
 * Durable dashboard login-attempt state.
 * Used by the Node login route so lockout survives serverless instance churn.
 */
export const dashboardAuthAttempts = pgTable("dashboard_auth_attempts", {
  clientKey: text("client_key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Durable command execution jobs.
 * Every human command from WhatsApp or dashboard lands here before work starts,
 * so commands get receipts, retries, approval gates, and visible status.
 */
export const commandJobs = pgTable(
  "command_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source", { enum: ["whatsapp", "dashboard"] }).notNull(),
    ownerHash: text("owner_hash").notNull().default("owner"),
    command: text("command").notNull(),
    status: text("status", {
      enum: ["received", "working", "needs_clarification", "needs_approval", "done", "failed", "retrying"],
    }).notNull().default("received"),
    riskLevel: text("risk_level", { enum: ["safe", "approval_required"] }).notNull().default("safe"),
    receiptText: text("receipt_text").notNull(),
    resultText: text("result_text"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    sourceMessageId: uuid("source_message_id"),
    sourceExternalId: text("source_external_id"),
    dedupeKey: text("dedupe_key"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("command_jobs_status_idx").on(t.status, t.createdAt),
    ownerStatusIdx: index("command_jobs_owner_status_idx").on(t.ownerHash, t.status, t.createdAt),
    dedupeIdx: uniqueIndex("command_jobs_dedupe_idx").on(t.dedupeKey),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Brief = typeof briefs.$inferSelect;
export type Confirmation = typeof confirmations.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type FeatureRequest = typeof featureRequests.$inferSelect;
export type NewFeatureRequest = typeof featureRequests.$inferInsert;
export type ProfileContext = typeof profileContext.$inferSelect;
export type NewProfileContext = typeof profileContext.$inferInsert;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type NewConnectedAccount = typeof connectedAccounts.$inferInsert;
export type SystemHeartbeat = typeof systemHeartbeats.$inferSelect;
export type NewSystemHeartbeat = typeof systemHeartbeats.$inferInsert;
export type DashboardAuthAttempt = typeof dashboardAuthAttempts.$inferSelect;
export type CommandJob = typeof commandJobs.$inferSelect;
export type NewCommandJob = typeof commandJobs.$inferInsert;
export type DailyFocus = typeof dailyFocus.$inferSelect;
export type NewDailyFocus = typeof dailyFocus.$inferInsert;
export type Snooze = typeof snoozes.$inferSelect;
export type NewSnooze = typeof snoozes.$inferInsert;
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type EntityKind = NewEntity["kind"];
