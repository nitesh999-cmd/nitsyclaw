import { redactAuditString, sanitizeAuditPayload } from "@nitsyclaw/shared/db";

export function formatSafeLogError(error: unknown): string {
  if (error instanceof Error) {
    return redactAuditString(`${error.name}: ${error.message}`);
  }
  return redactAuditString(String(error));
}

export function logBotError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(scope, context ? sanitizeAuditPayload(context) : {}, formatSafeLogError(error));
}
