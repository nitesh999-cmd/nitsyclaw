import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/client.js";
import { commandJobs, confirmations, dailyFocus, memories, reminders } from "../db/schema.js";
import { formatBriefDate } from "../utils/time.js";
import { assertPublicSaleTenantBoundaries } from "../tenancy.js";
import { looksLikeStoredPromptInjection } from "./pa-loop.js";

export type FocusEvidenceType = "daily_focus" | "reminder" | "approval" | "job" | "memory" | "project" | "calendar" | "email";

export interface FocusEvidence {
  id: string;
  type: FocusEvidenceType;
  title: string;
  source: string;
  dueAt?: Date;
  status?: string;
  confidence: number;
}

export interface TodayFocusPriority {
  id: string;
  title: string;
  why: string;
  smallestNextAction: string;
  source: string;
  score: number;
}

export interface TodayFocusPlan {
  generatedAt: string;
  priorities: TodayFocusPriority[];
  overdueOrAtRisk: string[];
  delegateOrDefer: string[];
  suggestedAction?: {
    label: string;
    reason: string;
    requiresApproval: boolean;
  };
  unavailableSources: string[];
  evidenceCount: number;
}

export async function loadTodayFocusEvidence(
  db: DB,
  ownerHash: string,
  now = new Date(),
  timezone = process.env.TIMEZONE ?? "Australia/Melbourne",
): Promise<FocusEvidence[]> {
  assertPublicSaleTenantBoundaries();
  const forDate = formatBriefDate(now, timezone);
  const [focusRows, reminderRows, confirmationRows, jobRows, memoryRows] = await Promise.all([
    db.select().from(dailyFocus).where(and(eq(dailyFocus.ownerHash, ownerHash), eq(dailyFocus.forDate, forDate))).orderBy(desc(dailyFocus.createdAt)).limit(1),
    db.select().from(reminders).where(and(eq(reminders.ownerHash, ownerHash), eq(reminders.status, "pending"))).orderBy(reminders.fireAt).limit(25),
    db.select().from(confirmations).where(and(eq(confirmations.ownerHash, ownerHash), eq(confirmations.status, "pending"))).orderBy(desc(confirmations.createdAt)).limit(10),
    db.select().from(commandJobs).where(eq(commandJobs.ownerHash, ownerHash)).orderBy(desc(commandJobs.createdAt)).limit(30),
    db.select().from(memories).where(eq(memories.ownerHash, ownerHash)).orderBy(desc(memories.createdAt)).limit(30),
  ]);

  const evidence: FocusEvidence[] = [];
  const focus = focusRows[0];
  if (focus?.chosenText && !focus.completedAt) {
    evidence.push({ id: focus.id, type: "daily_focus", title: focus.chosenText, source: `daily_focus:${focus.forDate}`, confidence: 1, status: "chosen" });
  } else if (focus && !focus.completedAt) {
    for (const [index, candidate] of (focus?.candidates ?? []).entries()) {
      evidence.push({ id: `${focus?.id ?? "focus"}-${index}`, type: "daily_focus", title: candidate, source: `daily_focus:${focus?.forDate ?? dateKey(now)}`, confidence: 0.8, status: "candidate" });
    }
  }
  evidence.push(...reminderRows.map((row) => ({
    id: row.id,
    type: "reminder" as const,
    title: row.text,
    source: `reminder:${row.id}`,
    dueAt: row.fireAt,
    status: row.fireAt < now ? "overdue" : "pending",
    confidence: 1,
  })));
  evidence.push(...confirmationRows.filter((row) => row.expiresAt >= now).map((row) => ({
    id: row.id,
    type: "approval" as const,
    title: `Review approval: ${humanize(row.action)}`,
    source: `confirmation:${row.id}`,
    dueAt: row.expiresAt,
    status: "pending",
    confidence: 1,
  })));
  evidence.push(...jobRows
    .filter((row) => ["failed", "retrying", "needs_approval", "needs_clarification", "working"].includes(row.status))
    .map((row) => ({
      id: row.id,
      type: "job" as const,
      title: row.command,
      source: `command_job:${row.id}`,
      dueAt: row.nextRunAt ?? undefined,
      status: row.status,
      confidence: 1,
    })));
  evidence.push(...memoryRows
    .filter((row) => row.tags.some((tag) => /project|commitment|follow[-_ ]?up|priority|task/i.test(tag)))
    .filter((row) => !row.tags.some((tag) => tag === "memory:forgotten" || tag === "memory:corrected"))
    .filter((row) => !looksLikeStoredPromptInjection(row.content))
    .map((row) => ({
      id: row.id,
      type: "memory" as const,
      title: row.content,
      source: row.sourceMessageId ? `message:${row.sourceMessageId}` : `memory:${row.id}`,
      status: row.tags.includes("confidence:uncertain") ? "uncertain" : "active",
      confidence: row.tags.includes("confidence:uncertain") ? 0.45 : 0.75,
    })));
  return evidence;
}

export function buildTodayFocusPlan(args: {
  evidence: FocusEvidence[];
  now?: Date;
  unavailableSources?: string[];
}): TodayFocusPlan {
  const now = args.now ?? new Date();
  const unique = dedupeEvidence(args.evidence)
    .map((item) => ({ item, score: focusScore(item, now) }))
    .sort((a, b) => b.score - a.score);
  const priorities = unique.slice(0, 3).map(({ item, score }) => ({
    id: item.id,
    title: cleanText(item.title),
    why: priorityReason(item, now),
    smallestNextAction: smallestAction(item),
    source: item.source,
    score,
  }));
  const overdueOrAtRisk = unique
    .filter(({ item }) => item.status === "overdue" || item.status === "failed" || item.status === "retrying" || (item.dueAt && item.dueAt < now))
    .slice(0, 5)
    .map(({ item }) => cleanText(item.title));
  const delegateOrDefer = unique
    .filter(({ item, score }) => score < 55 && (item.type === "memory" || item.type === "project" || item.status === "uncertain"))
    .slice(0, 3)
    .map(({ item }) => `${cleanText(item.title)} - defer until its owner or deadline is clearer.`);
  const first = priorities[0];
  return {
    generatedAt: now.toISOString(),
    priorities,
    overdueOrAtRisk,
    delegateOrDefer,
    suggestedAction: first ? {
      label: `Prepare the next step for: ${first.title}`,
      reason: "Preparation is reversible; any external send or change remains approval-gated.",
      requiresApproval: false,
    } : undefined,
    unavailableSources: Array.from(new Set(args.unavailableSources ?? [])),
    evidenceCount: unique.length,
  };
}

export function formatTodayFocusPlan(plan: TodayFocusPlan): string {
  const lines = ["Today - top focus"];
  if (!plan.priorities.length) {
    lines.push("I could not find enough current tasks, commitments, or memories to rank without guessing.");
  }
  for (const [index, priority] of plan.priorities.entries()) {
    lines.push("", `${index + 1}. ${priority.title}`, `Why: ${priority.why}`, `Next: ${priority.smallestNextAction}`);
  }
  if (plan.overdueOrAtRisk.length) lines.push("", `Overdue / at risk: ${plan.overdueOrAtRisk.join(" | ")}`);
  if (plan.delegateOrDefer.length) lines.push("", `Delegate or defer: ${plan.delegateOrDefer.join(" | ")}`);
  if (plan.suggestedAction) lines.push("", `I can help: ${plan.suggestedAction.label}`);
  if (plan.unavailableSources.length) lines.push("", `Unavailable sources: ${plan.unavailableSources.join(", ")}.`);
  return lines.join("\n");
}

function focusScore(item: FocusEvidence, now: Date): number {
  let score = item.confidence * 20;
  if (item.type === "daily_focus" && item.status === "chosen") score += 150;
  else if (item.status === "overdue") score += 100;
  else if (item.status === "failed") score += 95;
  else if (item.status === "retrying") score += 85;
  else if (item.type === "approval") score += 80;
  else if (item.type === "reminder") score += 65;
  else if (item.type === "calendar") score += 70;
  else if (item.type === "email") score += 45;
  else if (item.type === "job") score += 60;
  else if (item.type === "daily_focus") score += 55;
  else if (item.type === "memory") score += 35;
  else score += 20;
  if (item.dueAt) {
    const hours = (item.dueAt.getTime() - now.getTime()) / 3_600_000;
    if (hours < 0) score += 30;
    else if (hours <= 24) score += 25;
    else if (hours <= 72) score += 10;
  }
  return Math.round(score);
}

function priorityReason(item: FocusEvidence, now: Date): string {
  if (item.status === "overdue" || (item.dueAt && item.dueAt < now)) return "It is overdue and already at risk of slipping.";
  if (item.status === "failed" || item.status === "retrying") return "Work is blocked or retrying and needs a decision.";
  if (item.type === "daily_focus" && item.status === "chosen") return "You already chose this as today's focus.";
  if (item.type === "approval") return "NitsyClaw cannot continue until you review this approval.";
  if (item.type === "calendar") return "It is on today's connected calendar and has a fixed start time.";
  if (item.type === "email") return "It is an unread message that may need a decision or reply.";
  if (item.dueAt) return `It has a current deadline at ${item.dueAt.toLocaleString()}.`;
  if (item.type === "memory") return "It is a recorded project or commitment in recent memory.";
  return "It is active context with the strongest available evidence.";
}

function smallestAction(item: FocusEvidence): string {
  if (item.type === "approval") return "Open Review and accept or reject the exact action.";
  if (item.status === "failed" || item.status === "retrying") return "Open the work item and read the latest failure reason.";
  if (item.type === "reminder") return "Spend five minutes starting it, or reschedule it deliberately.";
  if (item.type === "calendar") return "Open the event and prepare the one outcome you need from it.";
  if (item.type === "email") return "Read it, then choose reply, delegate, defer, or archive.";
  if (item.type === "daily_focus") return "Write the first physical action and start a 15-minute block.";
  if (item.type === "memory" || item.type === "project") return "Define the next deliverable and its owner.";
  return "Open the source and choose the next reversible step.";
}

function dedupeEvidence(items: FocusEvidence[]): FocusEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const title = cleanText(item.title);
    if (!title || looksLikeStoredPromptInjection(title)) return false;
    const key = title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").trim();
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
