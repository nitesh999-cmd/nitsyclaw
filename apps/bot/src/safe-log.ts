import { redactAuditString, sanitizeAuditPayload } from "@nitsyclaw/shared/db";

/**
 * Postgres SQLSTATE classes (the first two characters). Validating against this
 * set — rather than a bare five-character shape — stops Node runtime codes that
 * happen to be five uppercase characters (EPIPE, EBUSY, EROFS) being reported as
 * database states.
 */
const SQLSTATE_CLASSES = new Set([
  "00", "01", "02", "03", "08", "09", "0A", "0B", "0F", "0L", "0P", "0Z",
  "20", "21", "22", "23", "24", "25", "26", "27", "28", "2B", "2D", "2F",
  "34", "38", "39", "3B", "3D", "3F", "40", "42", "44",
  "53", "54", "55", "57", "58", "72", "F0", "HV", "P0", "XX",
]);

const SQLSTATE_SHAPE = /^[0-9A-Z]{5}$/;

/** How far down an error's `cause` chain to look before giving up. */
const MAX_CAUSE_DEPTH = 5;

/**
 * Pull a Postgres SQLSTATE out of an error or its nested causes.
 *
 * Drizzle wraps driver failures as `Failed query: <sql>` and hangs the real
 * driver error — the one carrying `code` — off `cause`. Without walking the
 * chain the state code is unreachable, which is exactly how a read-only
 * transaction failure (25006) once went undiagnosed.
 *
 * The walk is depth-bounded and cycle-guarded, so a self-referential or deeply
 * nested chain cannot hang or overflow.
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

/**
 * Drop anything that could carry query text, bound values, or connection
 * details. Driver messages embed the full statement and sometimes the DSN, and
 * neither belongs in a log line.
 */
function stripQueryAndConnectionText(message: string): string {
  return message
    .replace(/Failed query:[\s\S]*/i, "Failed query: [sql omitted]")
    .replace(/\bparams\b\s*:[\s\S]*/i, "params: [omitted]")
    .replace(/\b(?:postgres|postgresql):\/\/\S*/gi, "[redacted:database-url]");
}

/**
 * Sanitized single-line rendering of an error.
 *
 * The SQLSTATE is prepended *after* redaction and truncation, so a long driver
 * message can never push the one genuinely diagnostic field out of the line.
 */
export function formatSafeLogError(error: unknown): string {
  const sqlState = extractSqlState(error);
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const safe = redactAuditString(stripQueryAndConnectionText(raw));
  return sqlState ? `[sqlstate:${sqlState}] ${safe}` : safe;
}

export function logBotError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(scope, context ? sanitizeAuditPayload(context) : {}, formatSafeLogError(error));
}
