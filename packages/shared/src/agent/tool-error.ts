// Structured classification of tool failures for the durable audit trail.
//
// A tool error message is free text: prose, a URL, a query, recalled memory, a
// SQL statement, a driver payload. None of that belongs in `audit_log`. Detailed
// sanitized text still goes to the operational log; only the structured fields
// here are persisted.

/** Classes a tool may claim. Anything else collapses to the generic class. */
export const TOOL_ERROR_CLASSES = [
  "tool_error",
  "unknown_tool",
  "validation_error",
  "not_configured",
  "not_available",
  "rate_limited",
  "timeout",
  "provider_error",
  "database_error",
  "permission_denied",
  "not_found",
  "conflict",
] as const;

export type ToolErrorClass = (typeof TOOL_ERROR_CLASSES)[number];

/**
 * Closed vocabulary of durable error codes.
 *
 * A shape check is not enough: `customer_abc123` and `memory_secret_token` both
 * satisfy any reasonable regex while carrying an identifier or a secret name.
 * Only exact members of this list are persisted, so adding a code requires a
 * source change and review — which is the point.
 *
 * Deliberately minimal. Codes are added when a real tool declares one, not in
 * advance for providers that might exist later.
 */
export const AUDIT_TOOL_ERROR_CODES = [
  "provider_throttled",
] as const;

export type AuditToolErrorCode = (typeof AUDIT_TOOL_ERROR_CODES)[number];

/** The safe default for any unclassified failure. */
export const DEFAULT_TOOL_ERROR_CLASS: ToolErrorClass = "tool_error";

/**
 * Structured, non-identifying error metadata. This is the ONLY error-derived
 * shape that may be persisted.
 */
export interface ToolErrorAudit {
  errorClass: ToolErrorClass;
  errorCode?: AuditToolErrorCode;
  sqlState?: string;
}

/**
 * Postgres SQLSTATE classes. Validating against the real class set — rather than
 * a bare five-character shape — stops Node runtime codes that happen to be five
 * uppercase characters (EPIPE, EBUSY) being recorded as database states.
 */
const SQLSTATE_CLASSES = new Set([
  "00", "01", "02", "03", "08", "09", "0A", "0B", "0F", "0L", "0P", "0Z",
  "20", "21", "22", "23", "24", "25", "26", "27", "28", "2B", "2D", "2F",
  "34", "38", "39", "3B", "3D", "3F", "40", "42", "44",
  "53", "54", "55", "57", "58", "72", "F0", "HV", "P0", "XX",
]);

const SQLSTATE_SHAPE = /^[0-9A-Z]{5}$/;
const MAX_CAUSE_DEPTH = 5;

/**
 * Pull a Postgres SQLSTATE out of an error or its nested causes.
 *
 * Drizzle wraps driver failures as `Failed query: <sql>` and hangs the real
 * driver error — the one carrying `code` — off `cause`. The walk is
 * depth-bounded and cycle-guarded, so a self-referential chain cannot hang.
 */
export function extractSqlState(error: unknown): string | undefined {
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!current || typeof current !== "object") return undefined;
    if (seen.has(current)) return undefined;
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SQLSTATE_SHAPE.test(code) && SQLSTATE_CLASSES.has(code.slice(0, 2))) {
      return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function allowedClass(value: unknown): ToolErrorClass | undefined {
  return TOOL_ERROR_CLASSES.includes(value as ToolErrorClass) ? (value as ToolErrorClass) : undefined;
}

/**
 * Exact membership only. A value is persisted because it is on the list, never
 * because it looks harmless.
 */
function allowedCode(value: unknown): AuditToolErrorCode | undefined {
  return AUDIT_TOOL_ERROR_CODES.includes(value as AuditToolErrorCode)
    ? (value as AuditToolErrorCode)
    : undefined;
}

export interface ToolErrorProjection {
  errorClass?: string;
  errorCode?: string;
}

/**
 * Classify a tool failure into persistable metadata.
 *
 * Without a projection — or with one that throws, or returns anything outside
 * the allowlists — the result is the generic class. A validated SQLSTATE is
 * carried as a bare code, never with the SQL or driver text around it.
 */
export function classifyToolError(
  projection: ((io: { input: unknown; error: unknown }) => ToolErrorProjection) | undefined,
  input: unknown,
  error: unknown,
): ToolErrorAudit {
  const sqlState = extractSqlState(error);
  const withSqlState = (audit: ToolErrorAudit): ToolErrorAudit =>
    sqlState ? { ...audit, sqlState } : audit;

  if (!projection) return withSqlState({ errorClass: DEFAULT_TOOL_ERROR_CLASS });

  try {
    const projected = projection({ input, error });
    const errorClass = allowedClass(projected?.errorClass) ?? DEFAULT_TOOL_ERROR_CLASS;
    const errorCode = allowedCode(projected?.errorCode);
    return withSqlState(errorCode ? { errorClass, errorCode } : { errorClass });
  } catch {
    // A throwing projection must not leak or fail the turn.
    return withSqlState({ errorClass: DEFAULT_TOOL_ERROR_CLASS });
  }
}
