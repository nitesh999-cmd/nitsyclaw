// Feature 25: Daily Focus Theme.
//
// Pick ONE thing per day. Morning brief proposes candidates via
// `propose_daily_focus`; user replies with their choice via `pick_daily_focus`;
// evening close-out or self-report fires `mark_daily_focus_done`.
//
// Read path is `get_today_focus` — used by other features (drift detector,
// evening digest) without needing a tool call.
//
// Design rule: one row per (owner_hash, for_date). Upserts are idempotent so
// the morning brief can re-propose candidates without breaking a prior pick.

import { z } from "zod";
import { formatBriefDate } from "../utils/time.js";
import { hashPhone } from "../utils/crypto.js";
import {
  getDailyFocus,
  markDailyFocusDone,
  pickDailyFocus,
  proposeDailyFocus,
} from "../db/repo.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { DB } from "../db/client.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { WhatsAppClient } from "../whatsapp/client.js";

function todayKey(now: Date, timezone: string): string {
  return formatBriefDate(now, timezone);
}

export function registerDailyFocus(registry: ToolRegistry): void {
  registry.register({
    name: "propose_daily_focus",
    description:
      "Save 2-5 candidate ONE-things for today's focus theme. Typically called from the morning brief. " +
      "Idempotent — calling again on the same day replaces the candidate list. Does not pick automatically.",
    inputSchema: z.object({
      candidates: z.array(z.string().min(1).max(200)).min(2).max(5),
    }),
    handler: async (input: { candidates: string[] }, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const forDate = todayKey(ctx.now, ctx.timezone);
      const row = await proposeDailyFocus(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), {
        ownerHash,
        forDate,
        candidates: input.candidates,
      });
      return {
        proposed: true,
        forDate,
        candidates: row.candidates,
        chosen: row.chosenText ?? null,
      };
    },
  });

  registry.register({
    name: "pick_daily_focus",
    description:
      "Record the user's chosen ONE-thing for today. Use when the user replies with their pick (verbatim text or a candidate letter / number resolved to its text). " +
      "Overwrites any prior pick for today.",
    inputSchema: z.object({
      chosenText: z.string().min(1).max(200),
    }),
    handler: async (input: { chosenText: string }, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const forDate = todayKey(ctx.now, ctx.timezone);
      const row = await pickDailyFocus(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), {
        ownerHash,
        forDate,
        chosenText: input.chosenText,
        now: ctx.now,
      });
      return {
        picked: true,
        forDate,
        chosenText: row.chosenText,
        chosenAt: row.chosenAt?.toISOString() ?? null,
      };
    },
  });

  registry.register({
    name: "mark_daily_focus_done",
    description:
      "Mark today's focus as completed. Use when user reports they finished their ONE-thing.",
    inputSchema: z.object({}).strict(),
    handler: async (_input: Record<string, never>, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const forDate = todayKey(ctx.now, ctx.timezone);
      const row = await markDailyFocusDone(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), {
        ownerHash,
        forDate,
        now: ctx.now,
      });
      if (!row) return { marked: false, reason: "No focus set for today" };
      return {
        marked: true,
        forDate,
        chosenText: row.chosenText,
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    },
  });

  registry.register({
    name: "focus_evening_close_out",
    description:
      "Send the user a one-line evening close-out for today's focus. Three states: " +
      "(a) focus picked AND completed -> affirmation, " +
      "(b) focus picked AND not completed -> 'did you ship X?' nudge, " +
      "(c) no focus picked -> 'no ONE set today; restart tomorrow'. " +
      "Used by the bot scheduler around 20:30 user time, or callable on demand.",
    inputSchema: z.object({}).strict(),
    handler: async (_input: Record<string, never>, ctx: ToolContext) => {
      const closed = await runFocusEveningCloseOut(
        ctx.deps.db,
        ctx.deps.whatsapp,
        ctx.userPhone,
        ctx.now,
        ctx.timezone,
      );
      return closed;
    },
  });

  registry.register({
    name: "get_today_focus",
    description:
      "Read today's focus row. Returns chosen text, completion status, and candidate list. " +
      "Use to check whether the user has picked, or to surface in evening close-out / drift nudges.",
    inputSchema: z.object({}).strict(),
    handler: async (_input: Record<string, never>, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const forDate = todayKey(ctx.now, ctx.timezone);
      const row = await getDailyFocus(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), {
        ownerHash,
        forDate,
      });
      if (!row) {
        return { forDate, present: false, candidates: [], chosenText: null, completed: false };
      }
      return {
        forDate,
        present: true,
        candidates: row.candidates,
        chosenText: row.chosenText,
        completed: Boolean(row.completedAt),
        chosenAt: row.chosenAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    },
  });
}

export type FocusCloseOutState =
  | "no_focus_set"
  | "focus_completed"
  | "focus_open";

export interface FocusCloseOutResult {
  state: FocusCloseOutState;
  delivered: boolean;
  forDate: string;
  chosenText: string | null;
}

/**
 * Scheduler-side helper. Sends a one-line evening close-out message to the
 * user about today's focus theme. Called from the bot scheduler around
 * 20:30 user time, or on demand via the `focus_evening_close_out` tool.
 */
export async function runFocusEveningCloseOut(
  db: DB,
  whatsapp: WhatsAppClient,
  ownerPhone: string,
  now: Date,
  timezone: string,
): Promise<FocusCloseOutResult> {
  const ownerHash = hashPhone(ownerPhone);
  const forDate = todayKey(now, timezone);
  const row = await getDailyFocus(db, privateOwnerTenantForPhone(ownerPhone), {
    ownerHash,
    forDate,
  });

  let body: string;
  let state: FocusCloseOutState;

  if (!row || !row.chosenText) {
    state = "no_focus_set";
    body =
      `Evening check — no ONE was set for ${forDate}.\n` +
      `That's OK. Pick one tomorrow morning when the brief arrives.`;
  } else if (row.completedAt) {
    state = "focus_completed";
    body =
      `Evening check — today's ONE: ${row.chosenText}\n` +
      `Marked done. Good day.`;
  } else {
    state = "focus_open";
    body =
      `Evening check — today's ONE: ${row.chosenText}\n` +
      `Did you ship it? Reply "yes" to mark done or "no" to roll it to tomorrow.`;
  }

  try {
    await whatsapp.send({ to: ownerPhone, body });
    return { state, delivered: true, forDate, chosenText: row?.chosenText ?? null };
  } catch {
    return { state, delivered: false, forDate, chosenText: row?.chosenText ?? null };
  }
}
