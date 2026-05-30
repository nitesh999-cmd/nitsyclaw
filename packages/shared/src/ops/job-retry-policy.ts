export type JobFailureCategory = "network" | "rate_limit" | "validation" | "auth" | "timeout" | "unknown";
export type JobEscalation = "none" | "P1" | "P0";

export interface JobRetryPolicyInput {
  error: unknown;
  attempts: number;
  maxAttempts: number;
  now?: Date;
  overrideDelayMs?: number;
}

export interface JobRetryPolicy {
  category: JobFailureCategory;
  retry: boolean;
  nextRunAt: Date | null;
  nextDelayMs: number;
  maxAttempts: number;
  escalation: JobEscalation;
  reason: string;
}

const MINUTE_MS = 60_000;
const MAX_RETRY_DELAY_MS = 60 * MINUTE_MS;

export function classifyJobFailure(error: unknown): JobFailureCategory {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const text = message.toLowerCase();

  if (/\b(unauthorized|forbidden|invalid api key|invalid token|token expired|oauth|auth|401|403)\b/.test(text)) {
    return "auth";
  }
  if (/\b(rate limit|too many requests|429|quota|throttle)\b/.test(text)) {
    return "rate_limit";
  }
  if (/\b(timeout|timed out|etimedout|deadline)\b/.test(text)) {
    return "timeout";
  }
  if (/\b(validation|invalid input|bad request|malformed|missing required|400)\b/.test(text)) {
    return "validation";
  }
  if (/\b(network|econnreset|enotfound|eai_again|socket|fetch failed|temporary|503|502|504|provider outage)\b/.test(text)) {
    return "network";
  }
  return "unknown";
}

export function planJobRetryPolicy(input: JobRetryPolicyInput): JobRetryPolicy {
  const now = input.now ?? new Date();
  const attempts = Math.max(0, input.attempts);
  const maxAttempts = Math.max(1, input.maxAttempts);
  const category = classifyJobFailure(input.error);

  if (category === "auth" || category === "validation") {
    return {
      category,
      retry: false,
      nextRunAt: null,
      nextDelayMs: 0,
      maxAttempts: 1,
      escalation: "P1",
      reason: `${category} failure needs a config, provider, or user-input fix before retrying`,
    };
  }

  const exhausted = attempts >= maxAttempts;
  if (exhausted) {
    return {
      category,
      retry: false,
      nextRunAt: null,
      nextDelayMs: 0,
      maxAttempts,
      escalation: category === "unknown" ? "P0" : "P1",
      reason: "retry budget exhausted",
    };
  }

  const baseDelayMs =
    category === "rate_limit" ? 15 * MINUTE_MS :
    category === "timeout" ? 10 * MINUTE_MS :
    category === "network" ? 5 * MINUTE_MS :
    10 * MINUTE_MS;
  const exponentialDelayMs = Math.min(MAX_RETRY_DELAY_MS, baseDelayMs * 2 ** Math.max(0, attempts - 1));
  const nextDelayMs = Math.max(0, input.overrideDelayMs ?? exponentialDelayMs);

  return {
    category,
    retry: true,
    nextRunAt: new Date(now.getTime() + nextDelayMs),
    nextDelayMs,
    maxAttempts,
    escalation: "none",
    reason: `${category} failure can retry with bounded backoff`,
  };
}
