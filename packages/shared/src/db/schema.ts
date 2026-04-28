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
  currency: text("currency").notNull().default("INR"),
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
    size: text("size", { enum: ["S", "M", "L"] }).notNull().default("M"),
    status: text("status", { enum: ["pending", "in_progress", "done", "rejected"] })
      .notNull()
      .default("pending"),
    source: text("source", { enum: ["whatsapp", "dashboard"] }).notNull(),
    requestedBy: text("requested_by"), // hashed phone or "owner"
    implementationNotes: text("implementation_notes"),
    prUrl: text("pr_url"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("feature_requests_status_idx").on(t.status, t.createdAt),
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
