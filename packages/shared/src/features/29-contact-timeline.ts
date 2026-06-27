// Feature 29: Contact Timeline.
//
// Real version of the council #5 follow-on. Joins the entity graph
// (Feature 28) back to source rows so the user can ask "show me everything
// about Sarah" and get a chronological list pulled from messages, memories,
// expenses, and reminders -- not just keyword hits.

import { z } from "zod";
import { hashPhone } from "../utils/crypto.js";
import { contactTimeline } from "../db/repo.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export function registerContactTimeline(registry: ToolRegistry): void {
  registry.register({
    name: "contact_timeline",
    description:
      "Show the user's history with a specific contact (person). Joins the entity graph " +
      "(typed person mentions) back to source rows in messages, memories, expenses, and reminders. " +
      "Returns chronological list (newest first) with preview + source citation. " +
      "Use for 'show me everything with Sarah', 'what's my history with Raj', " +
      "'last 5 things involving Mum'. Requires entities to have been recorded via record_entities; " +
      "if no person entities match the query, returns empty.",
    inputSchema: z.object({
      contactQuery: z.string().min(1).max(100).describe("Person name or substring"),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    handler: async (input: { contactQuery: string; limit?: number }, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const hits = await contactTimeline(
        ctx.deps.db,
        privateOwnerTenantForPhone(ctx.userPhone),
        { ownerHash, contactQuery: input.contactQuery, limit: input.limit },
      );
      return {
        contactQuery: input.contactQuery,
        count: hits.length,
        items: hits.map((h) => ({
          sourceTable: h.sourceTable,
          sourceId: h.sourceId,
          at: h.at.toISOString(),
          preview: h.preview,
          contactValue: h.contactValue,
        })),
      };
    },
  });
}
