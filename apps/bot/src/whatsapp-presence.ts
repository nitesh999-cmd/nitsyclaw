export interface PresenceClient {
  sendPresenceUnavailable(): Promise<void>;
}

export const DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS = 60_000;

export function parsePresenceUnavailableIntervalMs(value: string | number | undefined): number {
  if (value === undefined) return DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS;
  if (typeof value === "string" && value.trim() === "") return DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3_600_000) {
    return DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS;
  }
  return Math.floor(parsed);
}

export async function markPresenceUnavailable(
  client: PresenceClient,
  timeoutMs: number,
  label: string,
): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.sendPresenceUnavailable(),
      new Promise<void>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    return true;
  } catch (e) {
    console.error("[wwebjs] presence unavailable failed", e);
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
