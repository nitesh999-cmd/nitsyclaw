// The single durable-audit contract.
//
// `logAudit` is the only path to `audit_log`, and it accepts only a
// `SafeAuditEntry`. That type carries a private brand which cannot be produced
// by an object literal, so a caller cannot hand raw runtime data to the
// persistence boundary — it must go through one of the builders below, each of
// which copies approved fields individually.
//
// This shapes ONLY what is persisted. Runtime tool input and output, the result
// the model sees, the reply the user receives and the sanitized operational log
// are all untouched, as are row ownership, tenant scoping and authorization.
//
// Field classification used throughout:
//   approved boolean / approved number / approved timestamp / closed enum /
//   approved non-owner operational identifier
// Anything that is unsafe free text, an owner-linked identifier or runtime
// content is dropped here rather than reduced, redacted or truncated.

import { DEFAULT_TOOL_ERROR_CLASS, type ToolErrorAudit } from "../agent/tool-error.js";
import type { ModelRouteAuditPayload } from "../local-brain/telemetry-audit.js";

declare const SAFE_AUDIT_ENTRY: unique symbol;

/** Actors permitted to write a durable audit row. */
export const AUDIT_ACTORS = ["agent", "system", "user", "model-router", "operator-runner"] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];

interface AuditEntryFields {
  readonly actor: AuditActor;
  readonly tool: string;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
  readonly success: boolean;
  readonly error?: string;
  readonly durationMs?: number;
}

/**
 * A payload that has passed through a contract builder.
 *
 * The brand is declared but never assigned, so `{ ... } as SafeAuditEntry` is
 * the only way to fake one — an explicit, greppable, reviewable cast.
 */
export type SafeAuditEntry = AuditEntryFields & { readonly [SAFE_AUDIT_ENTRY]: true };

function seal(entry: AuditEntryFields): SafeAuditEntry {
  return entry as SafeAuditEntry;
}

/** Durable input and output both default to empty. Silence is the safe state. */
const EMPTY: Record<string, unknown> = {};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

// ---------------------------------------------------------------------------
// Agent tool calls (shared runAgent loop and the dashboard stream loop)
// ---------------------------------------------------------------------------

/**
 * A tool's own audit projection, already applied. A tool without an
 * `auditProjection` yields empty objects, in both loops.
 */
export interface ToolAuditIo {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export function auditToolSuccess(args: {
  tool: string;
  projected: ToolAuditIo;
  durationMs: number;
}): SafeAuditEntry {
  return seal({
    actor: "agent",
    tool: args.tool,
    input: args.projected.input,
    output: args.projected.output,
    success: true,
    durationMs: args.durationMs,
  });
}

export function auditToolFailure(args: {
  tool: string;
  projectedInput: Record<string, unknown>;
  errorAudit: ToolErrorAudit;
  durationMs: number;
}): SafeAuditEntry {
  const { errorClass, errorCode, sqlState } = args.errorAudit;
  return seal({
    actor: "agent",
    tool: args.tool,
    input: args.projectedInput,
    output: {
      errorClass: errorClass ?? DEFAULT_TOOL_ERROR_CLASS,
      ...(errorCode ? { errorCode } : {}),
      ...(sqlState ? { sqlState } : {}),
    },
    success: false,
    error: errorClass ?? DEFAULT_TOOL_ERROR_CLASS,
    durationMs: args.durationMs,
  });
}

/**
 * A tool name the model invented is not persisted. The row records that an
 * unknown tool was attempted, under a fixed token, and nothing else — no name,
 * no call input, no error prose.
 */
export function auditUnknownTool(args: { durationMs?: number } = {}): SafeAuditEntry {
  return seal({
    actor: "agent",
    tool: "unknown_tool",
    input: EMPTY,
    output: { errorClass: "unknown_tool" },
    success: false,
    error: "unknown_tool",
    ...(finiteNumber(args.durationMs) === undefined ? {} : { durationMs: args.durationMs }),
  });
}

// ---------------------------------------------------------------------------
// model_route
// ---------------------------------------------------------------------------

/** Preserves the projection built by `buildModelRouteAuditPayload` exactly. */
export function auditModelRoute(payload: ModelRouteAuditPayload): SafeAuditEntry {
  return seal({
    actor: "model-router",
    tool: "model_route",
    input: {
      mode: payload.input.mode,
      reason: payload.input.reason,
      requestClass: payload.input.requestClass,
      sensitivity: payload.input.sensitivity,
    },
    output: {
      route: payload.output.route,
      model: payload.output.model,
      fallback: payload.output.fallback,
    },
    success: payload.success,
    durationMs: payload.durationMs,
    ...(payload.error ? { error: payload.error } : {}),
  });
}

// ---------------------------------------------------------------------------
// Live web research
// ---------------------------------------------------------------------------

export function auditWebPresearch(args: {
  surface: "whatsapp";
  status: string;
  available: boolean;
  searchesUsed: number;
  sourceCount: number;
  answerLen: number;
  failureCode: string | null;
  elapsedMs: number;
  remainingBudget: number;
}): SafeAuditEntry {
  return seal({
    actor: "agent",
    tool: "web_presearch",
    input: { surface: args.surface },
    output: {
      status: args.status,
      available: args.available,
      searchesUsed: args.searchesUsed,
      sourceCount: args.sourceCount,
      answerLen: args.answerLen,
      failureCode: args.failureCode,
      elapsedMs: args.elapsedMs,
      remainingBudget: args.remainingBudget,
    },
    success: args.available,
    durationMs: args.elapsedMs,
  });
}

export function auditWebResearchFallback(args: {
  sourceCount: number;
  answerLen: number;
  searchesUsed: number;
  elapsedMs: number;
  timeoutCode: string;
}): SafeAuditEntry {
  return seal({
    actor: "agent",
    tool: "web_research_fallback",
    input: EMPTY,
    output: {
      fallbackType: "verified_presearch_answer",
      sourceCount: args.sourceCount,
      answerLen: args.answerLen,
      searchesUsed: args.searchesUsed,
      elapsedMs: args.elapsedMs,
      timeoutCode: args.timeoutCode,
    },
    success: true,
    durationMs: args.elapsedMs,
  });
}

// ---------------------------------------------------------------------------
// whatsapp_loop_breaker
// ---------------------------------------------------------------------------

/**
 * Closed reason vocabulary, one code per proven trip branch in
 * `WhatsAppLoopBreaker`. The runtime reason string is unchanged — it still
 * drives cooldown logic, the operational log and feature-request dedupe — but
 * only a code derived from it is persisted, because the send-burst branch
 * interpolates live counters into free text.
 */
export const LOOP_BREAKER_REASON_CODES = [
  "send_burst",
  "inbound_echo_match",
  "unknown_reason",
] as const;
export type LoopBreakerReasonCode = (typeof LOOP_BREAKER_REASON_CODES)[number];

export function loopBreakerReasonCode(reason: unknown): LoopBreakerReasonCode {
  if (typeof reason !== "string") return "unknown_reason";
  if (reason.startsWith("send burst:")) return "send_burst";
  if (reason === "inbound matched recent outbound") return "inbound_echo_match";
  return "unknown_reason";
}

export function auditLoopBreaker(incident: { reason: string; resetAt?: string }): SafeAuditEntry {
  const resetAt = isoTimestamp(incident.resetAt);
  return seal({
    actor: "system",
    tool: "whatsapp_loop_breaker",
    input: { reasonCode: loopBreakerReasonCode(incident.reason), cooldown: resetAt !== undefined },
    output: {
      action: resetAt ? "cooldown_whatsapp_replies" : "paused_whatsapp_replies",
      ...(resetAt ? { resetAt } : {}),
    },
    success: false,
    error: "loop_breaker_tripped",
  });
}

// ---------------------------------------------------------------------------
// whatsapp_recovery_action
// ---------------------------------------------------------------------------

/**
 * `action` reaches this builder only after the route has rejected anything
 * outside `VALID_ACTIONS` with a 400, so it is a closed enum by arrival.
 * `recorded` is a constant boolean and `proof` a fixed marker token — neither
 * is derived from the request.
 */
export function auditRecoveryAction(args: { action: string; durationMs: number }): SafeAuditEntry {
  return seal({
    actor: "user",
    tool: "whatsapp_recovery_action",
    input: { action: args.action },
    output: { recorded: true, proof: "manual_operator_marker" },
    success: true,
    ...(finiteNumber(args.durationMs) === undefined ? {} : { durationMs: args.durationMs }),
  });
}

// ---------------------------------------------------------------------------
// operator_runner.*
// ---------------------------------------------------------------------------

export const OPERATOR_EVENTS = ["claim", "reject", "verify", "complete"] as const;
export type OperatorEvent = (typeof OPERATOR_EVENTS)[number];

/** Feature-request row id: an operator-queue identifier, never owner-derived. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function operatorJobId(value: unknown): Record<string, unknown> {
  return typeof value === "string" && UUID_RE.test(value) ? { jobId: value.toLowerCase() } : EMPTY;
}

export function auditOperatorDecision(args: {
  event: Extract<OperatorEvent, "claim" | "reject">;
  jobId: string;
  decision: "claim" | "reject";
  nextStatus: "in_progress" | "rejected";
  commandCount?: number;
}): SafeAuditEntry {
  const commandCount = finiteNumber(args.commandCount);
  return seal({
    actor: "operator-runner",
    tool: `operator_runner.${args.event}`,
    input: operatorJobId(args.jobId),
    output: {
      decision: args.decision,
      nextStatus: args.nextStatus,
      ...(commandCount === undefined ? {} : { commandCount }),
    },
    success: true,
  });
}

/**
 * The failing command text, the run report path and the failure summary are all
 * free text or filesystem detail. Only the fact of failure is persisted.
 */
export function auditOperatorVerify(args: {
  jobId: string;
  commandCount: number;
  success: boolean;
  hasFailedCommand: boolean;
  durationMs: number;
}): SafeAuditEntry {
  const commandCount = finiteNumber(args.commandCount);
  return seal({
    actor: "operator-runner",
    tool: "operator_runner.verify",
    input: {
      ...operatorJobId(args.jobId),
      ...(commandCount === undefined ? {} : { commandCount }),
    },
    output: { success: args.success, hasFailedCommand: args.hasFailedCommand },
    success: args.success,
    ...(args.success ? {} : { error: "operator_command_failed" }),
    ...(finiteNumber(args.durationMs) === undefined ? {} : { durationMs: args.durationMs }),
  });
}

/**
 * `commit` and `deployment` are operator-supplied CLI strings. Their presence
 * is recorded; their values are not.
 */
export function auditOperatorComplete(args: {
  jobId: string;
  status: "done" | "rejected";
  hasCommit: boolean;
  hasDeployment: boolean;
}): SafeAuditEntry {
  return seal({
    actor: "operator-runner",
    tool: "operator_runner.complete",
    input: operatorJobId(args.jobId),
    output: { status: args.status, hasCommit: args.hasCommit, hasDeployment: args.hasDeployment },
    success: true,
  });
}
