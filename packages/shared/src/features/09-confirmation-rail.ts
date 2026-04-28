// Feature 9: Confirmation rail — destructive actions wait here.
//
// The user replies 'y' / 'yes' or 'n' / 'no' to a pending confirmation id.
// Without a confirmation id, the most-recently-pending one is used.

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { confirmations } from "../db/schema.js";
import { setConfirmationStatus } from "../db/repo.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { DB } from "../db/client.js";

export type ConfirmationDecision = "approved" | "rejected" | "expired";

/**
 * Resolve a user reply to a pending confirmation.
 * Returns the confirmation id and the decision; null if nothing was pending.
 */
export async function resolveConfirmation(args: {
  db: DB;
  reply: string;
  now: Date;
  confirmationId?: string;
}): Promise<{ id: string; action: string; decision: ConfirmationDecision; payload: Record<string, unknown> } | null> {
  const r = args.reply.trim().toLowerCase();
  const yes = /^(y|yes|approve|confirm|ok|okay)\b/.test(r);
  const no = /^(n|no|cancel|reject|abort)\b/.test(r);
  if (!yes && !no) return null;

  let row;
  if (args.confirmationId) {
    [row] = await args.db.select().from(confirmations).where(eq(confirmations.id, args.confirmationId)).limit(1);
  } else {
    [row] = await args.db
      .select()
      .from(confirmations)
      .where(eq(confirmations.status, "pending"))
      .orderBy(desc(confirmations.createdAt))
      .limit(1);
  }
  if (!row) return null;
  if (row.status !== "pending") return null;

  let decision: ConfirmationDecision;
  if (row.expiresAt < args.now) decision = "expired";
  else decision = yes ? "approved" : "rejected";

  await setConfirmationStatus(args.db, row.id, decision);
  return { id: row.id, action: row.action, decision, payload: row.payload as Record<string, unknown> };
}

export function registerConfirmationRail(registry: ToolRegistry): void {
  registry.register({
    name: "resolve_confirmation",
    description:
      "Resolve the most recent pending confirmation with a yes/no reply. Use when the user replies 'y'/'yes'/'n'/'no' to a pending action.",
    inputSchema: z.object({
      reply: z.enum(["yes", "no"]),
      confirmationId: z.string().optional(),
    }),
    handler: async (input: { reply: "yes" | "no"; confirmationId?: string }, ctx: ToolContext) => {
      const out = await resolveConfirmation({
        db: ctx.deps.db,
        reply: input.reply,
        now: ctx.now,
        confirmationId: input.confirmationId,
      });
      if (!out) return { resolved: false };
      // For approved create_calendar_event: actually create now.
      if (out.decision === "approved" && out.action === "create_calendar_event") {
        const p = out.payload as {
          title: string;
          start: string;
          durationMin: number;
          participants: string[];
          calendar?: "google" | "outlook";
        };
        const wantsOutlook = p.calendar === "outlook";
        const outlookFn = ctx.deps.calendar.createOutlookEvent;
        if (wantsOutlook && !outlookFn) {
          // Surface unavailable on this surface (e.g. dashboard route on Vercel can't reach ms-token.json).
          // Fall back to Google + flag so caller knows.
          const ev = await ctx.deps.calendar.createEvent({
            title: p.title,
            start: new Date(p.start),
            durationMin: p.durationMin,
            participants: p.participants,
          });
          return {
            resolved: true,
            decision: out.decision,
            eventId: ev.id,
            link: ev.htmlLink,
            calendar: "google",
            fallback: "outlook unavailable on this surface; created on Google instead",
          };
        }
        const ev = wantsOutlook
          ? await outlookFn!({
              title: p.title,
              start: new Date(p.start),
              durationMin: p.durationMin,
              participants: p.participants,
            })
          : await ctx.deps.calendar.createEvent({
              title: p.title,
              start: new Date(p.start),
              durationMin: p.durationMin,
              participants: p.participants,
            });
        return {
          resolved: true,
          decision: out.decision,
          eventId: ev.id,
          link: ev.htmlLink,
          calendar: wantsOutlook ? "outlook" : "google",
        };
      }
      return { resolved: true, decision: out.decision, action: out.action };
    },
  });
}
