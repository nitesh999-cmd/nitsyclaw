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
import type { DB } from "../db/client.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { AggregatorClient } from "../agent/deps.js";
import type { WhatsAppClient } from "../whatsapp/client.js";

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

// ===== Scheduler tick: T-10 auto pre-meeting brief =====

/**
 * Compose a one-block briefing text for an event, using personName as the
 * anchor (best-effort: extract first capitalised word from event title
 * if no explicit attendee resolution). Tool-shaped: same content the
 * brief_me_about_meeting tool would return.
 */
async function composeAutoBrief(
  db: DB,
  ownerPhone: string,
  args: { eventTitle: string; eventStart: Date; eventSource?: string },
): Promise<string> {
  const ownerHash = hashPhone(ownerPhone);
  const tenant = privateOwnerTenantForPhone(ownerPhone);
  const personGuess = guessPersonFromTitle(args.eventTitle);
  const lines: string[] = [];
  const localTime = args.eventStart.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  lines.push(`Heads up: ${args.eventTitle} at ${localTime}${args.eventSource ? ` [${args.eventSource}]` : ""}.`);

  if (personGuess) {
    const timeline = await contactTimeline(db, tenant, {
      ownerHash,
      contactQuery: personGuess,
      limit: 5,
    });
    if (timeline.length) {
      lines.push(`Recent history with ${personGuess}:`);
      for (const hit of timeline) {
        const at = hit.at.toISOString().slice(0, 10);
        lines.push(`  ${at} [${hit.sourceTable}] ${hit.preview}`);
      }
    } else {
      const entitiesOut = await findEntities(db, tenant, {
        ownerHash,
        query: personGuess,
        limit: 5,
      });
      if (entitiesOut.length) {
        lines.push(`Entities mentioning "${personGuess}":`);
        for (const e of entitiesOut) {
          lines.push(`  [${e.kind}] ${e.value}`);
        }
      } else {
        lines.push(`No prior history with ${personGuess}. Going in fresh.`);
      }
    }
  } else {
    lines.push("(no person extracted from title; skipping history lookup)");
  }
  return lines.join("\n");
}

function guessPersonFromTitle(title: string): string | null {
  // Drop common joiner words. Take the longest capitalised run after that.
  const cleaned = title
    .replace(/[/\-—:|]/g, " ")
    .replace(/\b(call|meeting|sync|catch up|chat|coffee|zoom|google meet|teams)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  const runs: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    if (/^[A-Z][a-zA-Z]+$/.test(w)) {
      cur.push(w);
    } else {
      if (cur.length) runs.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) runs.push(cur.join(" "));
  if (!runs.length) return null;
  return runs.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Per-process state for de-duping "already briefed this event". */
const briefedEventKeys = new Set<string>();
const BRIEFED_CACHE_MAX = 500;

function rememberBriefed(key: string): void {
  briefedEventKeys.add(key);
  if (briefedEventKeys.size > BRIEFED_CACHE_MAX) {
    const first = briefedEventKeys.values().next().value;
    if (first) briefedEventKeys.delete(first);
  }
}

export interface PreMeetingTickResult {
  scanned: number;
  briefed: number;
  skippedAlreadyBriefed: number;
}

/**
 * Scheduler tick: find calendar events starting in the next [leadMinMs, leadMaxMs)
 * window, brief each one once via WhatsApp.
 */
export async function runPreMeetingBriefTick(
  db: DB,
  whatsapp: WhatsAppClient,
  aggregator: AggregatorClient | undefined,
  ownerPhone: string,
  now: Date,
  timezone: string,
  args: { leadMinMs?: number; leadMaxMs?: number } = {},
): Promise<PreMeetingTickResult> {
  if (!aggregator) return { scanned: 0, briefed: 0, skippedAlreadyBriefed: 0 };
  const leadMin = args.leadMinMs ?? 8 * 60 * 1000;
  const leadMax = args.leadMaxMs ?? 15 * 60 * 1000;
  const winStart = new Date(now.getTime() + leadMin);
  const winEnd = new Date(now.getTime() + leadMax);

  const events = await aggregator.fetchAllEventsToday(timezone).catch(() => []);
  const dueEvents = events.filter((e) => e.start >= winStart && e.start < winEnd);
  let briefed = 0;
  let skipped = 0;
  for (const ev of dueEvents) {
    const key = `${ev.source ?? "cal"}|${ev.title}|${ev.start.toISOString()}`;
    if (briefedEventKeys.has(key)) {
      skipped++;
      continue;
    }
    try {
      const body = await composeAutoBrief(db, ownerPhone, {
        eventTitle: ev.title,
        eventStart: ev.start,
        eventSource: ev.source,
      });
      await whatsapp.send({ to: ownerPhone, body });
      rememberBriefed(key);
      briefed++;
    } catch {
      // leave key un-remembered so we retry next tick
    }
  }
  return { scanned: dueEvents.length, briefed, skippedAlreadyBriefed: skipped };
}

// Test-only helper: reset the in-process briefed cache between runs.
export function __resetPreMeetingCacheForTests(): void {
  briefedEventKeys.clear();
}
