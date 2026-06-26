// Feature 26: Snooze-and-resurface.
//
// User snoozes any message / email / note with a resurface time. Bot pings
// at the time with original content + optional pre-drafted reply.
//
// Mirrors reminders shape: scheduler sweep fires due rows every minute.

import { z } from "zod";
import { hashPhone } from "../utils/crypto.js";
import {
  cancelSnooze,
  dueSnoozes,
  insertSnooze,
  listMyPendingSnoozes,
  markSnoozeResurfaced,
} from "../db/repo.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { DB } from "../db/client.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { WhatsAppClient } from "../whatsapp/client.js";

function clampWindow(value: string, max: number): string {
  return value.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

export function registerSnooze(registry: ToolRegistry): void {
  registry.register({
    name: "snooze_thread",
    description:
      "Snooze any content (email body, message text, paragraph) and resurface it at a later time. " +
      "Use when the user says 'snooze this until tomorrow 9am', 'remind me about this on Sunday', or " +
      "'come back to this in 3 hours'. Optionally include a draft reply that surfaces with the resurface ping.",
    inputSchema: z.object({
      content: z.string().min(1).max(4000),
      resurfaceAtIso: z.string().describe("ISO timestamp when to resurface (>= now + 60s, <= now + 90 days)"),
      sourceHint: z.string().max(200).optional().describe("Short context label, e.g. 'Sarah - Q3 numbers thread'"),
      draftReply: z.string().max(2000).optional().describe("Pre-written reply to surface with the resurface ping"),
    }),
    handler: async (
      input: { content: string; resurfaceAtIso: string; sourceHint?: string; draftReply?: string },
      ctx: ToolContext,
    ) => {
      const resurfaceAt = new Date(input.resurfaceAtIso);
      if (isNaN(resurfaceAt.getTime())) throw new Error("invalid resurfaceAtIso");
      const minAt = new Date(ctx.now.getTime() + 60 * 1000);
      const maxAt = new Date(ctx.now.getTime() + 90 * 24 * 60 * 60 * 1000);
      if (resurfaceAt < minAt) throw new Error("resurfaceAt must be at least 60 seconds in the future");
      if (resurfaceAt > maxAt) throw new Error("resurfaceAt must be within 90 days");

      const row = await insertSnooze(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), {
        ownerHash: hashPhone(ctx.userPhone),
        content: clampWindow(input.content, 4000),
        sourceHint: input.sourceHint ? clampWindow(input.sourceHint, 200) : undefined,
        draftReply: input.draftReply ? clampWindow(input.draftReply, 2000) : undefined,
        resurfaceAt,
      });

      return {
        snoozed: true,
        id: row.id,
        resurfaceAt: row.resurfaceAt.toISOString(),
        sourceHint: row.sourceHint ?? null,
        hasDraftReply: Boolean(row.draftReply),
      };
    },
  });

  registry.register({
    name: "list_my_snoozes",
    description:
      "List the user's pending snoozes (not yet resurfaced or cancelled), ordered by resurface time.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    handler: async (input: { limit?: number }, ctx: ToolContext) => {
      const rows = await listMyPendingSnoozes(
        ctx.deps.db,
        privateOwnerTenantForPhone(ctx.userPhone),
        { ownerHash: hashPhone(ctx.userPhone), limit: input.limit },
      );
      return {
        count: rows.length,
        items: rows.map((r) => ({
          id: r.id,
          resurfaceAt: r.resurfaceAt.toISOString(),
          sourceHint: r.sourceHint ?? null,
          preview: r.content.slice(0, 120),
          hasDraftReply: Boolean(r.draftReply),
        })),
      };
    },
  });

  registry.register({
    name: "cancel_snooze",
    description: "Cancel a pending snooze by id. Snooze will not resurface.",
    inputSchema: z.object({ id: z.string().min(1) }),
    handler: async (input: { id: string }, ctx: ToolContext) => {
      const cancelled = await cancelSnooze(
        ctx.deps.db,
        privateOwnerTenantForPhone(ctx.userPhone),
        { id: input.id, ownerHash: hashPhone(ctx.userPhone) },
      );
      if (!cancelled) return { cancelled: false, reason: "Not found or not yours" };
      return { cancelled: true, id: input.id };
    },
  });
}

/**
 * Scheduler sweep: find due pending snoozes and send the resurface ping
 * via WhatsApp. Marks each row as resurfaced. Called once per minute from
 * the bot scheduler.
 */
export async function fireDueSnoozes(
  db: DB,
  whatsapp: WhatsAppClient,
  ownerPhone: string,
  now: Date,
): Promise<{ fired: number }> {
  const rows = await dueSnoozes(db, now, 20);
  let fired = 0;
  const tenant = privateOwnerTenantForPhone(ownerPhone);
  for (const row of rows) {
    const lines: string[] = [];
    lines.push(`Resurfacing snooze (${row.id.slice(0, 8)}):`);
    if (row.sourceHint) lines.push(`Re: ${row.sourceHint}`);
    lines.push("");
    lines.push(row.content);
    if (row.draftReply) {
      lines.push("");
      lines.push("Draft reply ready:");
      lines.push(row.draftReply);
    }
    lines.push("");
    lines.push(`Reply 'cancel snooze ${row.id.slice(0, 8)}' to dismiss, or take action above.`);
    try {
      await whatsapp.send({ to: ownerPhone, body: lines.join("\n") });
      await markSnoozeResurfaced(db, tenant, row.id);
      fired++;
    } catch {
      // leave row pending for retry next minute
    }
  }
  return { fired };
}
