const DEFAULT_MAX_CONSECUTIVE_FAILURES = 2;

const unhealthyStates = new Set([
  "CONFLICT",
  "DEPRECATED_VERSION",
  "OPENING",
  "PAIRING",
  "TIMEOUT",
  "UNLAUNCHED",
  "UNPAIRED",
  "UNPAIRED_IDLE",
]);

export function isHealthyWhatsAppState(state: string | null | undefined): boolean {
  return state?.toUpperCase() === "CONNECTED";
}

export function isUnhealthyWhatsAppState(state: string | null | undefined): boolean {
  if (!state) return true;
  return unhealthyStates.has(state.toUpperCase());
}

export function shouldRestartWhatsAppClient(
  consecutiveFailures: number,
  maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
): boolean {
  return consecutiveFailures >= maxConsecutiveFailures;
}

export type WhatsAppRuntimeStatus =
  | "initializing"
  | "ready"
  | "qr_required"
  | "health_ok"
  | "health_failed"
  | "restarting"
  | "auth_failure"
  | "disconnected"
  | "stopped";

export interface WhatsAppRuntimeEvent {
  status: WhatsAppRuntimeStatus;
  reason?: string;
  state?: string;
  consecutiveFailures?: number;
  qrAvailable?: boolean;
  at?: string;
}

export function statusForWhatsAppRuntimeEvent(
  event: WhatsAppRuntimeEvent,
): "ok" | "needs_attention" | "restarting" | "stopped" {
  if (event.status === "ready" || event.status === "health_ok") return "ok";
  if (event.status === "restarting" || event.status === "initializing") return "restarting";
  if (event.status === "stopped") return "stopped";
  return "needs_attention";
}

export function publicWhatsAppRuntimeMetadata(
  event: WhatsAppRuntimeEvent,
): Record<string, unknown> {
  return {
    status: event.status,
    reason: event.reason ? event.reason.slice(0, 180) : undefined,
    state: event.state,
    consecutiveFailures: event.consecutiveFailures,
    qrAvailable: event.qrAvailable === true ? true : undefined,
    at: event.at,
  };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
