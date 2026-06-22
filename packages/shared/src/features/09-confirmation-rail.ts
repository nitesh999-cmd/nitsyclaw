// Feature 9: Confirmation rail — destructive actions wait here.
//
// The user replies 'y <confirmationId>' / 'yes <confirmationId>' or
// 'n <confirmationId>' / 'no <confirmationId>' to a pending action.
// Side-effecting actions must never be resolved by a bare "yes".

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { confirmations } from "../db/schema.js";
import { restorePendingConfirmation, setConfirmationStatus } from "../db/repo.js";
import { assertPublicSaleTenantBoundaries, privateOwnerTenant, privateOwnerTenantForPhone } from "../tenancy.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { DB } from "../db/client.js";
import { createPrivateSpotifyPlaylist } from "../integrations/spotify.js";

export type ConfirmationDecision = "approved" | "rejected" | "expired";
const EXPLICIT_ID_REQUIRED_ACTIONS = new Set(["email_create_draft", "email_send"]);
const SIDE_EFFECT_ACTIONS = new Set([
  "create_calendar_event",
  "spotify_create_playlist",
  "email_create_draft",
  "email_send",
]);

/**
 * Resolve a user reply to a pending confirmation.
 * Returns the confirmation id and the decision; null if nothing was pending.
 */
export async function resolveConfirmation(args: {
  db: DB;
  reply: string;
  now: Date;
  confirmationId?: string;
  userPhone?: string;
}): Promise<{ id: string; action: string; decision: ConfirmationDecision; payload: Record<string, unknown> } | null> {
  assertPublicSaleTenantBoundaries();
  const r = args.reply.trim().toLowerCase();
  const yes = /^(y|yes|approve|approved|confirm|confirmed|ok|okay)\b/.test(r);
  const no = /^(n|no|cancel|reject|rejected|abort)\b/.test(r);
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
  if (!args.confirmationId && (EXPLICIT_ID_REQUIRED_ACTIONS.has(row.action) || SIDE_EFFECT_ACTIONS.has(row.action))) {
    return null;
  }

  let decision: ConfirmationDecision;
  if (row.expiresAt < args.now) decision = "expired";
  else decision = yes ? "approved" : "rejected";

  const tenant = args.userPhone ? privateOwnerTenantForPhone(args.userPhone) : privateOwnerTenant();
  await setConfirmationStatus(args.db, tenant, row.id, decision);
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
        userPhone: ctx.userPhone,
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
      if (out.decision === "approved" && out.action === "spotify_create_playlist") {
        const p = out.payload as {
          name: string;
          description?: string;
          uris: string[];
          ownerHash?: string;
        };
        const playlist = await createPrivateSpotifyPlaylist(ctx.deps.db, p.ownerHash ?? "", {
          name: p.name,
          description: p.description,
          uris: p.uris,
        });
        return {
          resolved: true,
          decision: out.decision,
          action: out.action,
          playlist,
        };
      }
      if (out.decision === "approved" && out.action === "email_send") {
        const p = out.payload as {
          provider: "gmail" | "outlook";
          accountLabel?: string;
          to: string[];
          cc?: string[];
          bcc?: string[];
          subject: string;
          body: string;
          replyToMessageId?: string;
        };
        if (!ctx.deps.emailSender) {
          await restorePendingConfirmation(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), out.id);
          return {
            resolved: true,
            decision: "pending_adapter",
            action: out.action,
            provider: p.provider,
            sent: false,
            unavailable:
              "Email send adapter is not configured on this surface. The confirmation is still pending; approve again after the adapter is available.",
          };
        }
        const result = await ctx.deps.emailSender.sendEmail(p);
        return {
          resolved: true,
          decision: out.decision,
          action: out.action,
          provider: p.provider,
          sent: true,
          messageId: result.messageId,
          threadId: result.threadId,
          webLink: result.webLink,
        };
      }
      if (out.decision === "approved" && out.action === "email_create_draft") {
        const p = out.payload as {
          provider: "gmail" | "outlook";
          accountLabel?: string;
          to: string[];
          cc?: string[];
          bcc?: string[];
          subject: string;
          body: string;
          replyToMessageId?: string;
        };
        if (!ctx.deps.emailDraft) {
          await restorePendingConfirmation(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), out.id);
          return {
            resolved: true,
            decision: "pending_adapter",
            action: out.action,
            provider: p.provider,
            draftCreated: false,
            unavailable:
              "Email draft adapter is not configured on this surface yet. The confirmation is still pending; approve again after the adapter is available.",
          };
        }
        const draft = await ctx.deps.emailDraft.createDraft(p);
        return {
          resolved: true,
          decision: out.decision,
          action: out.action,
          provider: p.provider,
          draftCreated: true,
          draftId: draft.draftId,
          messageId: draft.messageId,
          webLink: draft.webLink,
        };
      }
      return { resolved: true, decision: out.decision, action: out.action };
    },
  });
}
