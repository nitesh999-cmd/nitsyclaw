// Feature 31: Pre-meeting briefing.
//
// Composes a single WhatsApp-shaped briefing for an upcoming calendar
// event, using the entity graph (Feature 28) + contact timeline (Feature 29)
// to surface what the user already knows about each attendee.
//
// Tool-only this push; scheduler cron (every minute, fire 10 min before
// each event) is the next-session ship.

import { z } from "zod";
import { hashPhone } from "../utils/crypto.js";
import { contactTimeline, findEntities } from "../db/repo.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export function registerPreMeetingBrief(registry: ToolRegistry): void {
  registry.register({
    name: "brief_me_about_meeting",
    description:
      "Compose a quick briefing for an upcoming meeting. Provide either a person name (preferred), " +
      "or a freeform topic. Returns: recent history with the contact (via contact_timeline) + " +
      "any entities of kind person/org/topic that match. Use 10 min before a meeting, or whenever " +
      "the user asks 'brief me on my 3pm with Sarah', 'remind me about my meeting with Raj'.",
    inputSchema: z.object({
      personName: z.string().min(1).max(100).optional(),
      topic: z.string().min(1).max(200).optional(),
      historyLimit: z.number().int().min(1).max(20).optional(),
    }),
    handler: async (
      input: { personName?: string; topic?: string; historyLimit?: number },
      ctx: ToolContext,
    ) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const tenant = privateOwnerTenantForPhone(ctx.userPhone);
      const limit = input.historyLimit ?? 8;

      const personQuery = input.personName?.trim();
      const topicQuery = input.topic?.trim();

      const briefingParts: string[] = [];

      if (personQuery) {
        const timeline = await contactTimeline(ctx.deps.db, tenant, {
          ownerHash,
          contactQuery: personQuery,
          limit,
        });
        briefingParts.push(
          timeline.length
            ? `History with ${personQuery} (${timeline.length} hit${timeline.length === 1 ? "" : "s"}):`
            : `No prior history found with ${personQuery}.`,
        );
        for (const hit of timeline) {
          const at = hit.at.toISOString().slice(0, 10);
          briefingParts.push(`  ${at} [${hit.sourceTable}] ${hit.preview}`);
        }
      }

      if (topicQuery) {
        const matches = await findEntities(ctx.deps.db, tenant, {
          ownerHash,
          query: topicQuery,
          limit,
        });
        if (matches.length) {
          briefingParts.push("");
          briefingParts.push(`Related entities for "${topicQuery}":`);
          for (const m of matches) {
            const at = m.sourceAt?.toISOString().slice(0, 10) ?? m.createdAt.toISOString().slice(0, 10);
            briefingParts.push(`  ${at} [${m.kind}] ${m.value}`);
          }
        }
      }

      if (!personQuery && !topicQuery) {
        briefingParts.push("Pass personName or topic so I have something to brief on.");
      } else if (briefingParts.length === 1 && briefingParts[0]?.startsWith("No prior history")) {
        // Already covers the empty case.
      } else if (briefingParts.length === 0) {
        briefingParts.push("Nothing in the graph yet for this meeting. (Entities accrue from messages.)");
      }

      return {
        personName: personQuery ?? null,
        topic: topicQuery ?? null,
        body: briefingParts.join("\n"),
      };
    },
  });
}
