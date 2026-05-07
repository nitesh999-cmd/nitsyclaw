import { eq } from "drizzle-orm";
import type { DB } from "../db/client.js";
import { redactAuditString } from "../db/repo.js";
import { commandJobs, type CommandJob } from "../db/schema.js";
import { analyzePersonalPaIntent, isRiskyPersonalPaAction } from "./personal-pa-intent.js";

export type CommandJobSource = "whatsapp" | "dashboard";
export type CommandJobStatus = CommandJob["status"];

export interface CreateCommandJobInput {
  source: CommandJobSource;
  ownerHash: string;
  command: string;
  sourceMessageId?: string;
  sourceExternalId?: string;
  dedupeKey?: string;
  maxAttempts?: number;
}

export async function createCommandJob(
  db: DB,
  input: CreateCommandJobInput,
): Promise<CommandJob> {
  if (input.dedupeKey) {
    const existing = await getCommandJobByDedupeKey(db, input.dedupeKey);
    if (existing) return existing;
  }

  const intent = analyzePersonalPaIntent(input.command);
  const riskLevel = intent.kind === "approval_required" ? "approval_required" : "safe";
  const status: CommandJobStatus =
    intent.kind === "approval_required"
      ? "needs_approval"
      : intent.kind === "needs_clarification"
        ? "needs_clarification"
        : "received";
  const receiptText = intent.userFacingText;

  try {
    const [row] = await db
      .insert(commandJobs)
      .values({
        source: input.source,
        ownerHash: input.ownerHash,
        command: input.command.trim(),
        status,
        riskLevel,
        receiptText,
        attempts: 0,
        sourceMessageId: input.sourceMessageId,
        sourceExternalId: input.sourceExternalId,
        dedupeKey: input.dedupeKey,
        maxAttempts: input.maxAttempts ?? 3,
        updatedAt: new Date(),
      })
      .returning();

    return row!;
  } catch (error) {
    if (input.dedupeKey && isUniqueConstraintError(error)) {
      const existing = await getCommandJobByDedupeKey(db, input.dedupeKey);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function markCommandJobWorking(db: DB, id: string): Promise<CommandJob> {
  return updateCommandJob(db, id, {
    status: "working",
    error: null,
    updatedAt: new Date(),
  });
}

export async function completeCommandJob(
  db: DB,
  id: string,
  resultText: string,
): Promise<CommandJob> {
  const now = new Date();
  return updateCommandJob(db, id, {
    status: "done",
    resultText,
    error: null,
    completedAt: now,
    updatedAt: now,
  });
}

export async function recordCommandJobFailure(
  db: DB,
  id: string,
  error: unknown,
  opts: { now?: Date; retryDelayMs?: number } = {},
): Promise<CommandJob> {
  const current = await getCommandJob(db, id);
  const now = opts.now ?? new Date();
  const attempts = current.attempts + 1;
  const retryDelayMs = opts.retryDelayMs ?? 60_000;
  const status: CommandJobStatus = attempts < current.maxAttempts ? "retrying" : "failed";

  return updateCommandJob(db, id, {
    status,
    attempts,
    error: publicErrorMessage(error),
    nextRunAt: status === "retrying" ? new Date(now.getTime() + retryDelayMs) : null,
    completedAt: status === "failed" ? now : null,
    updatedAt: now,
  });
}

export async function getCommandJob(db: DB, id: string): Promise<CommandJob> {
  const [row] = await db
    .select()
    .from(commandJobs)
    .where(eq(commandJobs.id, id))
    .limit(1);
  if (!row) throw new Error(`Command job not found: ${id}`);
  return row;
}

async function getCommandJobByDedupeKey(db: DB, dedupeKey: string): Promise<CommandJob | null> {
  const [row] = await db
    .select()
    .from(commandJobs)
    .where(eq(commandJobs.dedupeKey, dedupeKey))
    .limit(1);
  return row ?? null;
}

function updateCommandJob(
  db: DB,
  id: string,
  patch: Partial<CommandJob>,
): Promise<CommandJob> {
  return db
    .update(commandJobs)
    .set(patch)
    .where(eq(commandJobs.id, id))
    .returning()
    .then((rows) => {
      const row = rows[0];
      if (!row) throw new Error(`Command job not found: ${id}`);
      return row;
    });
}

export function buildReceiptText(status: CommandJobStatus): string {
  if (status === "needs_clarification") {
    return "What is the main thing you want me to help with right now?";
  }
  if (status === "needs_approval") {
    return "Saved. Needs your approval before I act.";
  }
  return "Saved. Working on it.";
}

export function isRiskyCommand(command: string): boolean {
  return isRiskyPersonalPaAction(command);
}

function publicErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : String(error || "Unknown error");
  return redactAuditString(message).slice(0, 240);
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; constraint?: unknown; message?: unknown };
  return (
    record.code === "23505" ||
    String(record.constraint ?? "").includes("command_jobs_dedupe") ||
    String(record.message ?? "").includes("command_jobs_dedupe")
  );
}
