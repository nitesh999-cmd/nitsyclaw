// Feature 27: "Last time" recall.
//
// Cross-table semantic-ish search across the user's personal history surfaces
// (messages, memories, expenses, reminders). Pure ILIKE for now; embeddings
// can layer in later without changing the tool surface.
//
// Triggers: "when did I last email Mum?", "last time I bought coffee?",
// "what did the plumber say?", "show me last reminder about car service".

import { z } from "zod";
import { hashPhone } from "../utils/crypto.js";
import { recallAcrossSurfaces } from "../db/repo.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export function registerLastTimeRecall(registry: ToolRegistry): void {
  registry.register({
    name: "last_time_recall",
    description:
      "Search across the user's personal history (WhatsApp messages, saved memories, expenses, reminders) for any " +
      "matching text and return chronological hits with date + preview. Use for questions like " +
      "'when did I last email Mum?', 'how much did I pay the plumber last March?', 'what did I save about Sarah?'.",
    inputSchema: z.object({
      query: z.string().min(2).max(200),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    handler: async (input: { query: string; limit?: number }, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const hits = await recallAcrossSurfaces(
        ctx.deps.db,
        privateOwnerTenantForPhone(ctx.userPhone),
        {
          ownerHash,
          ownerPhoneHash: ownerHash,
          query: input.query,
          limit: input.limit,
        },
      );
      return {
        query: input.query,
        count: hits.length,
        items: hits.map((h) => ({
          kind: h.kind,
          id: h.id,
          at: h.at.toISOString(),
          preview: h.preview,
          context: h.context ?? null,
        })),
      };
    },
  });
}
