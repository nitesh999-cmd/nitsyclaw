// Feature 14: Safe read-only Gmail search.

import { z } from "zod";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export async function searchGmailInbox(
  input: { query: string; limit?: number },
  _ctx: ToolContext,
) {
  const { searchAllGmail } = await import("../../../../apps/bot/src/adapters.js").catch(() => ({
    searchAllGmail: async () => [] as any[],
  }));
  const rows = await searchAllGmail(input.query, input.limit ?? 5);
  return {
    query: input.query,
    count: rows.length,
    items: rows.map((m: any) => ({
      id: m.id,
      source: m.source,
      from: m.from,
      subject: m.subject,
      date: m.date instanceof Date ? m.date.toISOString() : new Date(m.date).toISOString(),
      snippet: m.snippet,
    })),
  };
}

export function registerEmailSearch(registry: ToolRegistry): void {
  registry.register({
    name: "search_gmail_inbox",
    description:
      "Search connected Gmail accounts by keyword and return matching email metadata/snippets. This is read-only and does not send, delete, archive, or mark messages.",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    handler: searchGmailInbox,
  });
}
