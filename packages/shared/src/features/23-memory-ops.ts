// Feature 23: Batch 2 memory and operations tools.
// These tools make the assistant more inspectable and safer before it acts.

import { z } from "zod";
import type { ToolRegistry } from "../agent/tools.js";

type Priority = "P0" | "P1" | "P2" | "P3";
type CommandRisk = "low" | "medium" | "high";

export interface StaleMemoryInput {
  facts: Array<{ fact: string; lastConfirmed?: string; source?: string }>;
  now?: string;
}

export interface MemorySourceLinkInput {
  fact: string;
  sourceSurface?: "whatsapp" | "dashboard" | "import" | "manual";
  sourceId?: string;
  capturedAt?: string;
}

export interface PriorityItemInput {
  title: string;
  ageDays?: number;
  dueInDays?: number;
  impact?: "low" | "medium" | "high";
  risk?: "low" | "medium" | "high";
}

export interface OneCommandCaptureInput {
  text: string;
}

export interface AgentRunLogInput {
  goal: string;
  decisions?: string[];
  filesTouched?: string[];
  commandsRun?: string[];
  errors?: string[];
  verification?: string[];
  result?: string;
}

export interface JobRetryPolicyInput {
  job: string;
  failureCategory: "network" | "rate_limit" | "validation" | "auth" | "unknown";
  attempts?: number;
}

export interface SafeCommandParseInput {
  text: string;
}

export interface OpsSloSnapshotInput {
  dashboardOk?: boolean;
  botFreshMinutes?: number;
  queueOldestHours?: number;
  apiLatencyMs?: number;
  failedToolRate?: number;
  liveSmokeOk?: boolean;
}

export interface IncidentTimelineInput {
  symptom: string;
  detectedAt?: string;
  surfaces?: string[];
  actions?: string[];
  recoveredAt?: string;
}

export interface LiveSmokeSuiteInput {
  baseUrl: string;
  includeDestructiveDenial?: boolean;
}

export function detectStaleMemory(input: StaleMemoryInput): {
  review: Array<{ fact: string; reason: string; recommendation: "confirm" | "expire" | "keep" }>;
} {
  const nowYear = yearFromDate(input.now) ?? new Date().getFullYear();
  return {
    review: input.facts.map((item) => {
      const fact = cleanText(item.fact);
      const lastYear = yearFromDate(item.lastConfirmed);
      if (/\b(current|now|today|travelling|temporary|this week)\b/i.test(fact)) {
        return { fact, reason: "time-sensitive wording", recommendation: "confirm" };
      }
      if (/\b(old|previous|former|used to)\b/i.test(fact)) {
        return { fact, reason: "historical wording", recommendation: "expire" };
      }
      if (lastYear && nowYear - lastYear >= 1) {
        return { fact, reason: `last confirmed in ${lastYear}`, recommendation: "confirm" };
      }
      return { fact, reason: "stable enough", recommendation: "keep" };
    }),
  };
}

export function createMemorySourceLink(input: MemorySourceLinkInput): {
  fact: string;
  source: string;
  trace: string;
  userControl: string[];
} {
  const surface = input.sourceSurface ?? "manual";
  const sourceId = cleanText(input.sourceId) || "not recorded";
  return {
    fact: cleanText(input.fact),
    source: `${surface}:${sourceId}`,
    trace: `Captured ${cleanText(input.capturedAt) || "at unknown time"} from ${surface}.`,
    userControl: ["view source", "edit fact", "expire fact", "delete fact"],
  };
}

export function rankPriorityItems(input: { items: PriorityItemInput[] }): {
  ranked: Array<PriorityItemInput & { score: number; priority: Priority }>;
} {
  const ranked = input.items
    .map((item) => {
      const score =
        impactScore(item.impact) +
        riskScore(item.risk) +
        dueScore(item.dueInDays) +
        Math.min(20, Math.max(0, item.ageDays ?? 0));
      return { ...item, score, priority: priorityFromScore(score) };
    })
    .sort((a, b) => b.score - a.score);
  return { ranked };
}

export function parseOneCommandCapture(input: OneCommandCaptureInput): {
  kind: "idea" | "task" | "bug" | "expense" | "person" | "reminder" | "location" | "note" | "feature";
  title: string;
  body: string;
  needsConfirmation: boolean;
} {
  const text = cleanText(input.text);
  const lowered = text.toLowerCase();
  const kind = lowered.startsWith("bug:")
    ? "bug"
    : lowered.startsWith("feature:") || /\b(add|build) .+\b(feature|page|tool)\b/i.test(text)
      ? "feature"
      : /\b(remind|tomorrow|next week|by monday|by friday)\b/i.test(text)
        ? "reminder"
        : /\$\d+|\bpaid|receipt|bill\b/i.test(text)
          ? "expense"
          : /\bmet|birthday|person|contact\b/i.test(text)
            ? "person"
            : /\b(location|travelling|weather in)\b/i.test(text)
              ? "location"
              : /\bidea\b/i.test(text)
                ? "idea"
                : /\b(task|todo|to do)\b/i.test(text)
                  ? "task"
                  : "note";
  return {
    kind,
    title: sentenceCase(text.replace(/^(bug|feature|idea|task|note):\s*/i, "").slice(0, 80)),
    body: text,
    needsConfirmation: ["feature", "reminder", "expense", "location"].includes(kind),
  };
}

export function createAgentRunLog(input: AgentRunLogInput): {
  summary: string;
  sections: Record<string, string[]>;
  status: "passed" | "failed" | "needs_review";
} {
  const errors = cleanList(input.errors);
  const verification = cleanList(input.verification);
  return {
    summary: cleanText(input.result) || cleanText(input.goal),
    sections: {
      decisions: cleanList(input.decisions),
      filesTouched: cleanList(input.filesTouched),
      commandsRun: cleanList(input.commandsRun),
      errors,
      verification,
    },
    status: errors.length > 0 ? "failed" : verification.length > 0 ? "passed" : "needs_review",
  };
}

export function planJobRetryPolicy(input: JobRetryPolicyInput): {
  retry: boolean;
  nextDelayMinutes: number;
  maxAttempts: number;
  escalation: Priority;
  reason: string;
} {
  const attempts = Math.max(0, input.attempts ?? 0);
  if (input.failureCategory === "auth" || input.failureCategory === "validation") {
    return { retry: false, nextDelayMinutes: 0, maxAttempts: 1, escalation: "P1", reason: "requires config or input fix" };
  }
  const base = input.failureCategory === "rate_limit" ? 15 : input.failureCategory === "network" ? 5 : 10;
  return {
    retry: attempts < 3,
    nextDelayMinutes: attempts < 3 ? base * 2 ** attempts : 0,
    maxAttempts: 3,
    escalation: attempts >= 3 ? "P1" : "P2",
    reason: attempts >= 3 ? "retry budget exhausted" : `${input.failureCategory} can be retried with backoff`,
  };
}

export function parseSafeCommand(input: SafeCommandParseInput): {
  intent: string;
  target: string;
  channel: string;
  risk: CommandRisk;
  requiresConfirmation: boolean;
} {
  const text = cleanText(input.text);
  const risk: CommandRisk = /\b(delete|send|pay|call|book|connect|grant|share)\b/i.test(text)
    ? "high"
    : /\b(read|import|export|search|draft)\b/i.test(text)
      ? "medium"
      : "low";
  const channel = /\bwhatsapp\b/i.test(text) ? "whatsapp" : /\bemail|gmail|outlook\b/i.test(text) ? "email" : "dashboard";
  return {
    intent: firstMatch(text, /\b(delete|send|pay|call|book|connect|grant|share|read|import|export|search|draft|remember|summarise|summarize)\b/i) || "capture",
    target: text.replace(/\b(please|can you|could you|nitsy|claw)\b/gi, "").trim().slice(0, 120),
    channel,
    risk,
    requiresConfirmation: risk !== "low",
  };
}

export function createOpsSloSnapshot(input: OpsSloSnapshotInput): {
  score: number;
  status: "healthy" | "degraded" | "critical";
  checks: Array<{ name: string; ok: boolean; value: string }>;
} {
  const checks = [
    { name: "Dashboard", ok: input.dashboardOk !== false, value: input.dashboardOk === false ? "down" : "ok" },
    { name: "Bot freshness", ok: (input.botFreshMinutes ?? 0) <= 10, value: `${input.botFreshMinutes ?? 0}m` },
    { name: "Queue age", ok: (input.queueOldestHours ?? 0) <= 24, value: `${input.queueOldestHours ?? 0}h` },
    { name: "API latency", ok: (input.apiLatencyMs ?? 0) <= 2000, value: `${input.apiLatencyMs ?? 0}ms` },
    { name: "Failed tool rate", ok: (input.failedToolRate ?? 0) <= 0.05, value: `${Math.round((input.failedToolRate ?? 0) * 100)}%` },
    { name: "Live smoke", ok: input.liveSmokeOk !== false, value: input.liveSmokeOk === false ? "failed" : "ok" },
  ];
  const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);
  return { score, status: score >= 85 ? "healthy" : score >= 60 ? "degraded" : "critical", checks };
}

export function createIncidentTimeline(input: IncidentTimelineInput): {
  title: string;
  timeline: string[];
  affectedSurfaces: string[];
  recoveryProof: string;
} {
  return {
    title: cleanText(input.symptom),
    timeline: [
      `Detected: ${cleanText(input.detectedAt) || "unknown"}.`,
      ...cleanList(input.actions).map((action) => `Action: ${action}.`),
      `Recovered: ${cleanText(input.recoveredAt) || "not yet verified"}.`,
    ],
    affectedSurfaces: cleanList(input.surfaces),
    recoveryProof: input.recoveredAt ? "Recovery time recorded; run smoke tests next." : "UNVERIFIED until smoke tests pass.",
  };
}

export function planLiveSmokeSuite(input: LiveSmokeSuiteInput): {
  baseUrl: string;
  checks: string[];
} {
  const baseUrl = cleanText(input.baseUrl).replace(/\/+$/, "");
  return {
    baseUrl,
    checks: [
      `GET ${baseUrl}/api/healthz returns 200 and no-store.`,
      `GET ${baseUrl}/login renders owner-gated login.`,
      `GET ${baseUrl}/chat redirects to login without a valid session.`,
      `POST ${baseUrl}/api/chat from a cross-origin request is rejected.`,
      `GET ${baseUrl}/privacy and /terms render.`,
      ...(input.includeDestructiveDenial ? [`POST ${baseUrl}/api/data/delete without proof is denied.`] : []),
    ],
  };
}

export function registerMemoryOps(registry: ToolRegistry): void {
  registry.register({
    name: "detect_stale_memory",
    description: "Find stale or time-sensitive memories that should be confirmed, expired, or kept.",
    inputSchema: z.object({
      facts: z.array(z.object({ fact: z.string().min(1), lastConfirmed: z.string().optional(), source: z.string().optional() })),
      now: z.string().optional(),
    }),
    handler: async (input: StaleMemoryInput) => detectStaleMemory(input),
  });

  registry.register({
    name: "create_memory_source_link",
    description: "Create a traceable source link record for a memory fact.",
    inputSchema: z.object({
      fact: z.string().min(1),
      sourceSurface: z.enum(["whatsapp", "dashboard", "import", "manual"]).optional(),
      sourceId: z.string().optional(),
      capturedAt: z.string().optional(),
    }),
    handler: async (input: MemorySourceLinkInput) => createMemorySourceLink(input),
  });

  registry.register({
    name: "rank_priority_items",
    description: "Rank reminders, approvals, follow-ups, bugs, or queued work by impact, risk, due date, and age.",
    inputSchema: z.object({
      items: z.array(z.object({
        title: z.string().min(1),
        ageDays: z.number().optional(),
        dueInDays: z.number().optional(),
        impact: z.enum(["low", "medium", "high"]).optional(),
        risk: z.enum(["low", "medium", "high"]).optional(),
      })),
    }),
    handler: async (input: { items: PriorityItemInput[] }) => rankPriorityItems(input),
  });

  registry.register({
    name: "parse_one_command_capture",
    description: "Classify a one-line capture command as idea, task, bug, expense, person, reminder, location, note, or feature.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: OneCommandCaptureInput) => parseOneCommandCapture(input),
  });

  registry.register({
    name: "create_agent_run_log",
    description: "Create a structured run log for agent work, decisions, files, commands, errors, and verification.",
    inputSchema: z.object({
      goal: z.string().min(1),
      decisions: z.array(z.string()).optional(),
      filesTouched: z.array(z.string()).optional(),
      commandsRun: z.array(z.string()).optional(),
      errors: z.array(z.string()).optional(),
      verification: z.array(z.string()).optional(),
      result: z.string().optional(),
    }),
    handler: async (input: AgentRunLogInput) => createAgentRunLog(input),
  });

  registry.register({
    name: "plan_job_retry_policy",
    description: "Choose retry/backoff/escalation rules for a failed job.",
    inputSchema: z.object({
      job: z.string().min(1),
      failureCategory: z.enum(["network", "rate_limit", "validation", "auth", "unknown"]),
      attempts: z.number().int().min(0).optional(),
    }),
    handler: async (input: JobRetryPolicyInput) => planJobRetryPolicy(input),
  });

  registry.register({
    name: "parse_safe_command",
    description: "Parse a command into intent, target, channel, risk, and confirmation requirement.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: SafeCommandParseInput) => parseSafeCommand(input),
  });

  registry.register({
    name: "create_ops_slo_snapshot",
    description: "Create a simple operations health score from dashboard, bot, queue, latency, tool, and smoke signals.",
    inputSchema: z.object({
      dashboardOk: z.boolean().optional(),
      botFreshMinutes: z.number().optional(),
      queueOldestHours: z.number().optional(),
      apiLatencyMs: z.number().optional(),
      failedToolRate: z.number().optional(),
      liveSmokeOk: z.boolean().optional(),
    }),
    handler: async (input: OpsSloSnapshotInput) => createOpsSloSnapshot(input),
  });

  registry.register({
    name: "create_incident_timeline",
    description: "Create an incident timeline with affected surfaces, actions, and recovery proof status.",
    inputSchema: z.object({
      symptom: z.string().min(1),
      detectedAt: z.string().optional(),
      surfaces: z.array(z.string()).optional(),
      actions: z.array(z.string()).optional(),
      recoveredAt: z.string().optional(),
    }),
    handler: async (input: IncidentTimelineInput) => createIncidentTimeline(input),
  });

  registry.register({
    name: "plan_live_smoke_suite",
    description: "Plan safe live smoke checks for production routes.",
    inputSchema: z.object({
      baseUrl: z.string().min(1),
      includeDestructiveDenial: z.boolean().optional(),
    }),
    handler: async (input: LiveSmokeSuiteInput) => planLiveSmokeSuite(input),
  });
}

function impactScore(value: PriorityItemInput["impact"]): number {
  return value === "high" ? 35 : value === "medium" ? 20 : 5;
}

function riskScore(value: PriorityItemInput["risk"]): number {
  return value === "high" ? 30 : value === "medium" ? 15 : 3;
}

function dueScore(dueInDays: number | undefined): number {
  if (dueInDays === undefined) return 5;
  if (dueInDays <= 0) return 35;
  if (dueInDays <= 2) return 25;
  if (dueInDays <= 7) return 15;
  return 3;
}

function priorityFromScore(score: number): Priority {
  if (score >= 80) return "P0";
  if (score >= 55) return "P1";
  if (score >= 30) return "P2";
  return "P3";
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[0]?.toLowerCase();
}

function yearFromDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/\b(20\d{2}|19\d{2})\b/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function cleanList(values: string[] | undefined): string[] {
  return (values ?? []).map(cleanText).filter(Boolean).slice(0, 20);
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string): string {
  const cleaned = cleanText(value);
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}
