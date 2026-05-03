// Cross-surface conversation history loader.
// Pulls the last N messages for an owner from BOTH surfaces (whatsapp + dashboard)
// and converts them into the role/content turn shape that runAgent expects.

import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/client.js";
import { messages } from "../db/schema.js";
import { decryptString, isEncryptedString } from "../utils/crypto.js";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Decrypt a body if ENCRYPTION_KEY is set, otherwise return as-is.
 * Bodies may be plaintext (legacy or unencrypted) or encrypted (AES-256-GCM).
 * If decrypt fails (e.g. plaintext that happens to be base64-shaped), we return raw.
 */
function safeDecrypt(body: string): string {
  if (!process.env.ENCRYPTION_KEY || !body) return body;
  try {
    return decryptString(body);
  } catch {
    if (isEncryptedString(body)) return "[unreadable encrypted message]";
    return body;
  }
}

/**
 * Load the last N messages for this owner across BOTH surfaces and return
 * them oldest→newest as agent history turns. direction='in' becomes 'user',
 * direction='out' becomes 'assistant'.
 */
export async function loadCrossSurfaceHistory(
  db: DB,
  ownerHash: string,
  limit = 20,
): Promise<HistoryTurn[]> {
  const rows = await db
    .select({
      direction: messages.direction,
      body: messages.body,
      transcript: messages.transcript,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.fromNumber, ownerHash))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows
    .reverse()
    .map((r) => ({
      role: (r.direction === "out" ? "assistant" : "user") as "user" | "assistant",
      content: safeDecrypt(r.transcript ?? r.body ?? ""),
    }))
    .filter((t) => t.content.trim().length > 0);
}
