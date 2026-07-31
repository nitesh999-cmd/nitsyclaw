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
import type {
  DataSensitivity,
  LocalBrainMode,
  ModelRoute,
  PaRequestClass,
} from "../local-brain/types.js";
import type { OllamaProviderError } from "../local-brain/ollama-provider.js";
import type { LiveWebResearchFailureCode, LiveWebResearchStatus } from "../search/types.js";

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

// ---------------------------------------------------------------------------
// Closed vocabularies and normalizers
//
// A builder copying a field individually is not on its own a guarantee: an
// individually copied string is still whatever the producer put in it. Every
// string below is therefore either an exact member of a vocabulary declared
// here, or a value normalized into a shape that cannot carry owner data, user
// text, a URL, a query, a credential or prose.
//
// Where the producer already has a union type, `AssertComplete` ties the two
// together at compile time: adding a member to the source union without adding
// it here is a type error, so the vocabulary cannot silently fall behind.
// ---------------------------------------------------------------------------

/** `true` only when `Values` covers every member of `Union`. */
type AssertComplete<Union extends string, Values extends readonly Union[]> =
  Exclude<Union, Values[number]> extends never ? true : ["audit vocabulary missing", Exclude<Union, Values[number]>];

/** Exact membership. Anything else is not a member — no prefix or shape match. */
function isMember<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** An exact member, or `undefined` so the caller can drop the key entirely. */
function member<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return isMember(allowed, value) ? value : undefined;
}

/**
 * An exact member, or a fixed token for fields that must always be present.
 * The fallback is deliberately allowed to sit outside the vocabulary so an
 * unrecognised value reads as unknown instead of impersonating a real member.
 */
function memberOr<T extends string, F extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: F,
): T | F {
  return isMember(allowed, value) ? value : fallback;
}

/**
 * A durable audit token: lowercase snake_case, bounded length.
 *
 * Used for values whose provenance is a source-declared constant (a registry
 * tool name) rather than a list short enough to enumerate here. All 125
 * registered tool names satisfy this shape, so a conforming name is a real
 * name; anything else is a value the registry never produced.
 */
const AUDIT_TOKEN_RE = /^[a-z][a-z0-9_]{0,63}$/;

function auditToken(value: unknown, fallback: string): string {
  return typeof value === "string" && AUDIT_TOKEN_RE.test(value) ? value : fallback;
}

/**
 * The tables the erasure route counts rows for.
 *
 * The counts loop copies keys as well as values, so the key space is closed
 * here too — otherwise a key could carry content that the value check drops.
 * A shape check is not enough: `req_01HQZX9K2M4N6P8R0T2V4W6Y8A` satisfies any
 * reasonable identifier pattern. Every key the route writes is a source-declared
 * literal, so exact membership is both achievable and correct, and
 * `audit-string-provenance.test.ts` reads the route to keep this list in step.
 */
export const DELETE_COUNT_TABLES = [
  "memories",
  "messages",
  "confirmations",
  "expenses",
  "featureRequests",
  "profileContext",
  "reminders",
  "connectedAccounts",
  "systemHeartbeats",
  "briefs",
  "dashboardAuthAttempts",
  "auditLog",
] as const;

/**
 * A local model name, e.g. `qwen3:8b` or `llama3.1:8b-instruct-q4_K_M`.
 *
 * Reported by the Ollama service (`selectModel` returns a name straight out of
 * the installed tag list) rather than chosen from a list here, so it is
 * normalized rather than enumerated. The required `name:tag` form is what
 * Ollama always returns, and it does the real work: a bare token shape would
 * also admit a request id such as `req_01HQZX9K2M4N6P8R0T2V4W6Y8A`, which this
 * rejects. Together with the charset — no `@`, `/`, whitespace or prose
 * punctuation — an email, URL, phone number, SQL fragment, owner hash or
 * sentence cannot satisfy it.
 */
const MODEL_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,39}:[a-z0-9][a-z0-9._-]{0,39}$/i;

function modelName(value: unknown): string | undefined {
  return typeof value === "string" && MODEL_NAME_RE.test(value) ? value : undefined;
}

/**
 * An application-generated instant, re-serialized to canonical ISO-8601.
 *
 * The shape is checked before parsing, so a loose form `Date.parse` happens to
 * accept (`"2026"`, a locale date) is not silently widened into a timestamp,
 * and the range is bounded to plausible operational time.
 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MIN_AUDIT_INSTANT_MS = Date.UTC(2000, 0, 1);
const MAX_AUDIT_INSTANT_MS = Date.UTC(2100, 0, 1);

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !ISO_INSTANT_RE.test(value)) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < MIN_AUDIT_INSTANT_MS || parsed > MAX_AUDIT_INSTANT_MS) return undefined;
  return new Date(parsed).toISOString();
}

// -- model_route -------------------------------------------------------------

export const ROUTING_MODES = ["local_only", "auto", "best_reasoning"] as const;
const _MODES_COMPLETE: AssertComplete<LocalBrainMode, typeof ROUTING_MODES> = true;

export const ROUTING_ROUTES = ["local", "cloud", "blocked"] as const;
const _ROUTES_COMPLETE: AssertComplete<ModelRoute, typeof ROUTING_ROUTES> = true;

export const ROUTING_REQUEST_CLASSES = [
  "answer_only",
  "read_only_investigation",
  "reversible_local_action",
  "external_action_requires_approval",
  "destructive_sensitive_requires_confirmation",
] as const;
const _CLASSES_COMPLETE: AssertComplete<PaRequestClass, typeof ROUTING_REQUEST_CLASSES> = true;

export const ROUTING_SENSITIVITIES = ["ordinary", "private", "highly_sensitive"] as const;
const _SENSITIVITIES_COMPLETE: AssertComplete<DataSensitivity, typeof ROUTING_SENSITIVITIES> = true;

/**
 * Every reason the router attaches to a decision. `ModelRoutingDecision.reason`
 * is typed `string`, so this list is the boundary that makes it closed;
 * `audit-vocabulary.test.ts` reads the router source and fails if a branch
 * introduces a reason that is missing here.
 */
export const ROUTING_REASON_CODES = [
  "local_only_mode",
  "local_only_but_ollama_unavailable",
  "sensitive_data_stays_local",
  "sensitive_data_cannot_fallback_without_approval",
  "explicit_full_context_cloud_approval",
  "live_web_research_requires_cloud",
  "live_web_research_cloud_unavailable",
  "best_reasoning_mode",
  "cloud_unavailable_local_degraded_path",
  "no_model_available",
  "private_everyday_local_default",
  "ollama_unavailable_safe_cloud_fallback",
  "no_permitted_model_available",
  "difficult_reasoning_prefers_cloud",
  "low_local_confidence",
  "local_runtime_failure_safe_cloud_fallback",
] as const;

/** `model_call_failed`, plus one `ollama_`-prefixed code per provider class. */
export const ROUTING_ERROR_CODES = [
  "model_call_failed",
  "ollama_offline",
  "ollama_timeout",
  "ollama_model_missing",
  "ollama_bad_response",
  "ollama_cancelled",
] as const;

// -- live web research -------------------------------------------------------

export const WEB_RESEARCH_STATUSES = ["ok", "no_results", "unavailable"] as const;
const _STATUSES_COMPLETE: AssertComplete<LiveWebResearchStatus, typeof WEB_RESEARCH_STATUSES> = true;

export const WEB_RESEARCH_FAILURE_CODES = [
  "not_configured",
  "disabled_by_config",
  "provider_disabled",
  "unsupported_model",
  "rate_limited",
  "max_uses_exceeded",
  "query_rejected",
  "search_error",
  "request_failed",
  "no_search_performed",
] as const;
const _FAILURES_COMPLETE: AssertComplete<
  LiveWebResearchFailureCode,
  typeof WEB_RESEARCH_FAILURE_CODES
> = true;

/** The provider error classes a research timeout can be reported under. */
export const WEB_RESEARCH_TIMEOUT_CODES = [
  "offline",
  "timeout",
  "model_missing",
  "bad_response",
  "cancelled",
] as const;
const _TIMEOUTS_COMPLETE: AssertComplete<
  OllamaProviderError["code"],
  typeof WEB_RESEARCH_TIMEOUT_CODES
> = true;

// -- whatsapp_recovery_action ------------------------------------------------

/** Mirrors `VALID_ACTIONS` in the recovery route, checked again here. */
export const RECOVERY_ACTIONS = [
  "railway_auth_checked",
  "railway_restarted",
  "phone_proof_started",
  "phone_proof_passed",
  "phone_proof_failed",
] as const;

// -- data_delete -------------------------------------------------------------

export const DELETE_SCOPES = ["memories", "conversations", "everything"] as const;

// -- operator_runner ---------------------------------------------------------

export const OPERATOR_DECISIONS = ["claim", "reject"] as const;
export const OPERATOR_NEXT_STATUSES = ["in_progress", "rejected"] as const;
export const OPERATOR_COMPLETE_STATUSES = ["done", "rejected"] as const;

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
    tool: auditToken(args.tool, "unknown_tool"),
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
    tool: auditToken(args.tool, "unknown_tool"),
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

/**
 * Preserves the key set built by `buildModelRouteAuditPayload`, with every
 * string held to its vocabulary.
 *
 * `mode`, `route`, `requestClass` and `sensitivity` are compile-time-complete
 * unions. `reason` and the error code are typed `string` upstream, so they are
 * checked against the lists above. `model` is reported by the Ollama service
 * rather than chosen here, so it is shape-normalized and dropped if it does not
 * look like a model name.
 */
export function auditModelRoute(payload: ModelRouteAuditPayload): SafeAuditEntry {
  const error = member(ROUTING_ERROR_CODES, payload.error);
  return seal({
    actor: "model-router",
    tool: "model_route",
    // An out-of-vocabulary value is recorded as unknown rather than substituted
    // with a real member: an audit row must not assert a route or sensitivity
    // that did not happen.
    input: {
      mode: memberOr(ROUTING_MODES, payload.input.mode, "unknown_mode"),
      reason: memberOr(ROUTING_REASON_CODES, payload.input.reason, "unknown_reason_code"),
      requestClass: memberOr(
        ROUTING_REQUEST_CLASSES,
        payload.input.requestClass,
        "unknown_request_class",
      ),
      sensitivity: memberOr(ROUTING_SENSITIVITIES, payload.input.sensitivity, "unknown_sensitivity"),
    },
    output: {
      route: memberOr(ROUTING_ROUTES, payload.output.route, "unknown_route"),
      model: modelName(payload.output.model),
      fallback: payload.output.fallback === true,
    },
    success: payload.success,
    durationMs: payload.durationMs,
    ...(error ? { error } : {}),
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
    input: { surface: memberOr(["whatsapp"] as const, args.surface, "unknown_surface") },
    output: {
      status: memberOr(WEB_RESEARCH_STATUSES, args.status, "unknown_status"),
      available: args.available === true,
      searchesUsed: args.searchesUsed,
      sourceCount: args.sourceCount,
      answerLen: args.answerLen,
      // `null` is the real "no failure" value and is preserved; a non-null
      // value survives only as an exact member of the failure vocabulary.
      failureCode:
        args.failureCode === null
          ? null
          : memberOr(WEB_RESEARCH_FAILURE_CODES, args.failureCode, "unknown_failure_code"),
      elapsedMs: args.elapsedMs,
      remainingBudget: args.remainingBudget,
    },
    success: args.available === true,
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
      // A fixed marker, not a caller value.
      fallbackType: "verified_presearch_answer",
      sourceCount: args.sourceCount,
      answerLen: args.answerLen,
      searchesUsed: args.searchesUsed,
      elapsedMs: args.elapsedMs,
      timeoutCode: memberOr(WEB_RESEARCH_TIMEOUT_CODES, args.timeoutCode, "unknown_timeout_code"),
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
 * outside `VALID_ACTIONS` with a 400 — but the route's check is not the
 * contract's, so membership is enforced again here against `RECOVERY_ACTIONS`.
 * `recorded` is a constant boolean and `proof` a fixed marker token — neither
 * is derived from the request.
 */
export function auditRecoveryAction(args: { action: string; durationMs: number }): SafeAuditEntry {
  return seal({
    actor: "user",
    tool: "whatsapp_recovery_action",
    input: { action: memberOr(RECOVERY_ACTIONS, args.action, "unknown_action") },
    output: { recorded: true, proof: "manual_operator_marker" },
    success: true,
    ...(finiteNumber(args.durationMs) === undefined ? {} : { durationMs: args.durationMs }),
  });
}

// ---------------------------------------------------------------------------
// data_delete
// ---------------------------------------------------------------------------

/**
 * Erasure receipt: how much was removed, not what was in it.
 *
 * `scope` is rejected by `parseScope` before this point and checked again here
 * against `DELETE_SCOPES`.
 *
 * There is deliberately no snapshot identifier. The previous contract accepted
 * `exportSnapshotId` and gated it on `UUID_RE`, but the producer
 * (`/api/data/export`) mints `export_<14 digits>` from the export timestamp, so
 * that gate never matched a real snapshot and the field never persisted. The
 * value also arrived straight off a form field, and no audit consumer reads it:
 * the activity, health, command and privacy-center views render `tool`,
 * `success`, `error` and the output payload, and the export path sanitizes both
 * payloads. What the receipt actually needs is whether the export-before-delete
 * gate was satisfied, which is a boolean — so `hasExportSnapshot` replaces it
 * and no request-supplied string reaches `audit_log` from this route.
 *
 * Row counts are copied one key at a time. Both halves are bounded: the key
 * must look like a table name and the value must be a number.
 */
export function auditDataDelete(args: {
  scope: string;
  hasExportSnapshot: boolean;
  deleted: Record<string, unknown>;
  durationMs: number;
}): SafeAuditEntry {
  const counts: Record<string, number> = {};
  for (const [table, value] of Object.entries(args.deleted)) {
    if (!isMember(DELETE_COUNT_TABLES, table)) continue;
    const count = finiteNumber(value);
    if (count !== undefined) counts[table] = count;
  }
  return seal({
    actor: "user",
    tool: "data_delete",
    input: {
      scope: memberOr(DELETE_SCOPES, args.scope, "unknown_scope"),
      hasExportSnapshot: args.hasExportSnapshot === true,
    },
    output: { deleted: counts },
    success: true,
    ...(finiteNumber(args.durationMs) === undefined ? {} : { durationMs: args.durationMs }),
  });
}

// ---------------------------------------------------------------------------
// operator_runner.*
// ---------------------------------------------------------------------------

export const OPERATOR_EVENTS = ["claim", "reject", "verify", "complete"] as const;
export type OperatorEvent = (typeof OPERATOR_EVENTS)[number];

/**
 * Feature-request row id.
 *
 * Retained, unlike the export snapshot id, because all five evidence tests hold:
 *  - provenance: `feature_requests.id` is `uuid().defaultRandom()`, generated by
 *    Postgres. `operator-runner` passes the id of a row it just selected;
 *    `operator-complete` takes it from argv but rejects a non-UUID before any
 *    database call, and only audits after the row was found and updated.
 *  - format: exactly the UUID shape below, anchored.
 *  - length: 36 characters, fixed by the anchored pattern.
 *  - not owner-derived: `defaultRandom()` has no owner or user input.
 *  - required by a consumer: it is the operator job correlation key that ties a
 *    claim, verify and complete row to one queue item.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function operatorJobId(value: unknown): Record<string, unknown> {
  return typeof value === "string" && UUID_RE.test(value) ? { jobId: value.toLowerCase() } : EMPTY;
}

/**
 * Tool names are selected from this map rather than interpolated, so the `tool`
 * column cannot be shaped by a caller value.
 */
const OPERATOR_TOOLS = {
  claim: "operator_runner.claim",
  reject: "operator_runner.reject",
  verify: "operator_runner.verify",
  complete: "operator_runner.complete",
} as const satisfies Record<OperatorEvent, string>;

const UNKNOWN_OPERATOR_TOOL = "operator_runner.unknown";

export function auditOperatorDecision(args: {
  event: Extract<OperatorEvent, "claim" | "reject">;
  jobId: string;
  decision: "claim" | "reject";
  nextStatus: "in_progress" | "rejected";
  commandCount?: number;
}): SafeAuditEntry {
  const commandCount = finiteNumber(args.commandCount);
  const event = member(OPERATOR_DECISIONS, args.event);
  return seal({
    actor: "operator-runner",
    tool: event ? OPERATOR_TOOLS[event] : UNKNOWN_OPERATOR_TOOL,
    input: operatorJobId(args.jobId),
    output: {
      decision: memberOr(OPERATOR_DECISIONS, args.decision, "unknown_decision"),
      nextStatus: memberOr(OPERATOR_NEXT_STATUSES, args.nextStatus, "unknown_status"),
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
    tool: OPERATOR_TOOLS.verify,
    input: {
      ...operatorJobId(args.jobId),
      ...(commandCount === undefined ? {} : { commandCount }),
    },
    output: { success: args.success === true, hasFailedCommand: args.hasFailedCommand === true },
    success: args.success === true,
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
    tool: OPERATOR_TOOLS.complete,
    input: operatorJobId(args.jobId),
    output: {
      status: memberOr(OPERATOR_COMPLETE_STATUSES, args.status, "unknown_status"),
      hasCommit: args.hasCommit === true,
      hasDeployment: args.hasDeployment === true,
    },
    success: true,
  });
}
