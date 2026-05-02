export interface PresenceClient {
  sendPresenceUnavailable(): Promise<void>;
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
