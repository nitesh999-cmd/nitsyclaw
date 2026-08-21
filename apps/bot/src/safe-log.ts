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
      // Each frame is pushed as its own field so that per-field redaction gives it
      // an independent length budget — a single deep node_modules path is long
      // enough to consume the whole allowance on its own.
      const frames = error.stack.split("\n").slice(1, 4).map((line) => line.trim()).filter(Boolean);
      frames.forEach((frame, index) => parts.push(`stack[${index}]=${frame}`));
    }
  } else {
    parts.push(String(error));
  }
  // Redact each field separately rather than the joined line.
  //
  // redactAuditString truncates at 160 characters. That budget was written for a
  // single message, and once stack frames are appended the whole line is cut mid
  // path — the first real diagnosis this produced was truncated inside the very
  // frame that named the failing call. Redacting per field gives each frame its own
  // budget, so a long path can no longer evict the fields after it.
  //
  // The 160-char cap itself is deliberately NOT raised: redactAuditString is a
  // shared audit contract used by data export, the agent loop and command jobs, and
  // widening it there would change redaction behaviour well outside logging. Every
  // field here still passes through exactly the same scrubbing function.
  const safe = parts
    .map((part) => redactAuditString(stripQueryAndConnectionText(part)))
    .join(" ");
  return sqlState ? `[sqlstate:${sqlState}] ${safe}` : safe;
}

export function logBotError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(scope, context ? sanitizeAuditPayload(context) : {}, formatSafeLogError(error));
}
