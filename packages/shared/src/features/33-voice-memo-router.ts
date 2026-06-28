// Feature 33: Voice memo router.
//
// Takes a voice-note transcript and routes its action items into typed
// slots: reminders, notes (memories), person entities, topic entities.
// Single LLM call extracts structured JSON; results inserted directly
// (no confirmation rail — voice came from the owner, low-risk surfaces
// only: no money / no irreversible sends).

import { z } from "zod";
import { insertEntities, insertMemory, insertReminder } from "../db/repo.js";
import { hashPhone } from "../utils/crypto.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { LlmClient } from "../agent/deps.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

const ROUTE_SYSTEM = `You extract structured action items from a voice-note transcript.
Reply with one JSON object, no prose, no markdown, no code fence.

Shape:
{
  "reminders": [{ "text": "...", "fireAtIso": "ISO timestamp" }],
  "notes": ["..."],
  "people": ["..."],
  "topics": ["..."]
}

Rules:
- reminders: explicit dated commitments ("call Mum tomorrow 7pm", "email Sarah Friday").
  fireAtIso MUST be a valid ISO timestamp resolved against the user's local time.
- notes: thoughts to remember without a fire-time ("idea: ...", "remember that ...").
- people: distinct person names mentioned, deduped.
- topics: distinct subject/topic keywords mentioned (not generic words).
- Skip pronouns and the speaker themselves.
- Empty arrays for any slot with no matches.
- Max 5 reminders, 5 notes, 8 people, 8 topics per memo.`;

export interface RoutedItems {
  reminders: Array<{ text: string; fireAtIso: string }>;
  notes: string[];
  people: string[];
  topics: string[];
}

export function parseRouteJson(text: string): RoutedItems {
  const empty: RoutedItems = { reminders: [], notes: [], people: [], topics: [] };
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
  const obj = parsed as Record<string, unknown>;

  const out: RoutedItems = { reminders: [], notes: [], people: [], topics: [] };

  if (Array.isArray(obj.reminders)) {
    for (const r of obj.reminders.slice(0, 5)) {
      if (!r || typeof r !== "object") continue;
      const rr = r as { text?: unknown; fireAtIso?: unknown };
      if (typeof rr.text !== "string" || typeof rr.fireAtIso !== "string") continue;
      const t = rr.text.trim();
      if (!t || t.length > 500) continue;
      const at = new Date(rr.fireAtIso);
      if (isNaN(at.getTime())) continue;
      out.reminders.push({ text: t, fireAtIso: at.toISOString() });
    }
  }
  if (Array.isArray(obj.notes)) {
    for (const n of obj.notes.slice(0, 5)) {
      if (typeof n !== "string") continue;
      const v = n.trim();
      if (v && v.length <= 2000) out.notes.push(v);
    }
  }
  if (Array.isArray(obj.people)) {
    for (const p of obj.people.slice(0, 8)) {
      if (typeof p !== "string") continue;
      const v = p.trim();
      if (v && v.length <= 100) out.people.push(v);
    }
  }
  if (Array.isArray(obj.topics)) {
    for (const t of obj.topics.slice(0, 8)) {
      if (typeof t !== "string") continue;
      const v = t.trim();
      if (v && v.length <= 100) out.topics.push(v);
    }
  }
  return out;
}

export async function extractRoutedItems(
  llm: LlmClient,
  transcript: string,
  now: Date,
  timezone: string,
): Promise<RoutedItems> {
  if (!transcript || transcript.length < 3) return { reminders: [], notes: [], people: [], topics: [] };
  const truncated = transcript.slice(0, 4000);
  const resp = await llm.complete({
    system: ROUTE_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Current local time: ${now.toISOString()} (timezone: ${timezone})\n\n` +
          `Transcript:\n${truncated}`,
      },
    ],
    maxTokens: 600,
  });
  return parseRouteJson(resp.text);
}

export interface RouteVoiceMemoResult {
  remindersCreated: string[];
  noteIds: string[];
  entitiesCreated: number;
  summary: string;
}

export function registerVoiceMemoRouter(registry: ToolRegistry): void {
  registry.register({
    name: "route_voice_memo",
    description:
      "Route a voice-note transcript into typed action items. Extracts reminders (with fire times), " +
      "notes (saved as memories), and person/topic entities. Insertions are direct (no confirmation) " +
      "for low-risk surfaces. Use whenever the user sends a voice note OR explicitly asks 'route this memo'. " +
      "Returns counts + ids + one-line summary the bot can echo back to the user.",
    inputSchema: z.object({
      transcript: z.string().min(3).max(4000),
      sourceMessageId: z.string().optional().describe("UUID of the originating message row for entity citation"),
    }),
    handler: async (input: { transcript: string; sourceMessageId?: string }, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const tenant = privateOwnerTenantForPhone(ctx.userPhone);
      const extracted = await extractRoutedItems(
        ctx.deps.llm,
        input.transcript,
        ctx.now,
        ctx.timezone,
      );

      const remindersCreated: string[] = [];
      for (const r of extracted.reminders) {
        try {
          const row = await insertReminder(ctx.deps.db, tenant, {
            text: r.text,
            fireAt: new Date(r.fireAtIso),
          });
          remindersCreated.push(row.id);
        } catch {
          // skip individual failures
        }
      }

      const noteIds: string[] = [];
      for (const n of extracted.notes) {
        try {
          const row = await insertMemory(ctx.deps.db, tenant, {
            kind: "note",
            content: n,
            tags: ["voice-memo"],
            sourceMessageId: input.sourceMessageId,
          });
          noteIds.push(row.id);
        } catch {
          // skip
        }
      }

      const entityRows: Array<{ ownerHash: string; kind: "person" | "topic"; value: string; sourceTable?: string; sourceId?: string; sourceAt?: Date }> = [];
      for (const p of extracted.people) {
        entityRows.push({
          ownerHash,
          kind: "person",
          value: p,
          sourceTable: input.sourceMessageId ? "messages" : undefined,
          sourceId: input.sourceMessageId,
          sourceAt: ctx.now,
        });
      }
      for (const t of extracted.topics) {
        entityRows.push({
          ownerHash,
          kind: "topic",
          value: t,
          sourceTable: input.sourceMessageId ? "messages" : undefined,
          sourceId: input.sourceMessageId,
          sourceAt: ctx.now,
        });
      }
      let entitiesCreated = 0;
      if (entityRows.length) {
        try {
          const inserted = await insertEntities(ctx.deps.db, tenant, entityRows);
          entitiesCreated = inserted.length;
        } catch {
          entitiesCreated = 0;
        }
      }

      const summaryParts: string[] = [];
      if (remindersCreated.length) summaryParts.push(`${remindersCreated.length} reminder${remindersCreated.length === 1 ? "" : "s"}`);
      if (noteIds.length) summaryParts.push(`${noteIds.length} note${noteIds.length === 1 ? "" : "s"}`);
      if (extracted.people.length) summaryParts.push(`${extracted.people.length} person${extracted.people.length === 1 ? "" : "s"}`);
      if (extracted.topics.length) summaryParts.push(`${extracted.topics.length} topic${extracted.topics.length === 1 ? "" : "s"}`);
      const summary = summaryParts.length
        ? `Routed: ${summaryParts.join(", ")}.`
        : "Routed: nothing actionable found in the memo.";

      const result: RouteVoiceMemoResult = {
        remindersCreated,
        noteIds,
        entitiesCreated,
        summary,
      };
      return result;
    },
  });
}
