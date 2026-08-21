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
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(`${error.name}: ${error.message}`);
    // `name` and `message` alone are useless when the throw originates in minified
    // code: a bundled dependency reports both as the same mangled identifier, and
    // the line reads "r: r" with nothing to locate the failing call. The three
    // fields below survive minification — the constructor names the error class, a
    // `code` carries the domain taxonomy (VoicePipelineError codes, driver codes),
    // and the first frames name the call site.
    const ctor = (error as { constructor?: { name?: string } }).constructor?.name;
    if (ctor && ctor !== error.name) parts.push(`ctor=${ctor}`);
    const code = (error as { code?: unknown }).code;
    if (code !== undefined && code !== null && code !== "") parts.push(`code=${String(code)}`);
    if (error.stack) {
      // Frames only: the first stack line repeats name/message, already captured.
      const frames = error.stack.split("\n").slice(1, 4).map((line) => line.trim()).filter(Boolean);
      if (frames.length > 0) parts.push(`stack=${frames.join(" | ")}`);
    }
  } else {
    parts.push(String(error));
  }
  // Redaction runs over the assembled line, so stack frames and codes are held to
  // exactly the same secret-scrubbing contract the message has always been.
  const safe = redactAuditString(stripQueryAndConnectionText(parts.join(" ")));
  return sqlState ? `[sqlstate:${sqlState}] ${safe}` : safe;
}

export function logBotError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(scope, context ? sanitizeAuditPayload(context) : {}, formatSafeLogError(error));
}
