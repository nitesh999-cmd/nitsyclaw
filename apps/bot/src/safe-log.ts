import { redactAuditString, sanitizeAuditPayload } from "@nitsyclaw/shared/db";
// Single implementation, shared with the agent loop's audit classification.
import { extractSqlState } from "@nitsyclaw/shared/agent";
export { extractSqlState };

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
