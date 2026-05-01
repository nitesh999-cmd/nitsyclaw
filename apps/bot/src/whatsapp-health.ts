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
