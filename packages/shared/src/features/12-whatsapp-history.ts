// Feature 12: WhatsApp/dashboard conversation history search.

import { z } from "zod";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import { recentMessages } from "../db/repo.js";
import type { Message } from "../db/schema.js";
import { decryptString, hashPhone } from "../utils/crypto.js";

function safeDecrypt(body: string): string {
  if (!process.env.ENCRYPTION_KEY || !body) return body;
  try {
    return decryptString(body);
  } catch {
    return body;
  }
}

function haystack(row: Message): string {
  return safeDecrypt(row.transcript ?? row.body ?? "");
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function searchConversationHistory(
  ctx: ToolContext,
  input: { query: string; limit?: number; surface?: "whatsapp" | "dashboard" | "all" },
) {
  const query = input.query.trim().toLowerCase();
  const limit = input.limit ?? 8;
  const surface = input.surface ?? "all";
  const rows = await recentMessages(ctx.deps.db, hashPhone(ctx.userPhone), 250);

  const matches = rows
    .filter((row) => surface === "all" || row.surface === surface)
    .map((row) => ({ row, body: compact(haystack(row)) }))
    .filter(({ body }) => body.toLowerCase().includes(query))
    .slice(0, limit)
    .map(({ row, body }) => ({
      id: row.id,
      surface: row.surface,
      direction: row.direction,
      mediaType: row.mediaType,
      createdAt: row.createdAt.toISOString(),
      snippet: body.length > 360 ? `${body.slice(0, 357)}...` : body,
    }));

  return {
    query: input.query,
    count: matches.length,
    items: matches,
  };
}

export function registerWhatsAppHistory(registry: ToolRegistry): void {
  registry.register({
    name: "search_conversation_history",
    description:
      "Search Nitesh's saved WhatsApp and dashboard conversation history by keyword. Use this when he asks what he said, sent, asked, or discussed before.",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(20).optional(),
      surface: z.enum(["whatsapp", "dashboard", "all"]).optional(),
    }),
    handler: searchConversationHistory,
  });
}
