// Feature 30: Auto entity extraction worker.
//
// Background pass: every few minutes, find recent owner messages that
// don't yet have entities in the graph, run a dedicated lightweight LLM
// call to extract typed entities, batch-insert via insertEntities.
//
// Hot path is NOT touched. Bot reply latency stays unchanged.

import { z } from "zod";
import {
  insertEntities,
  recentMessagesWithoutEntities,
} from "../db/repo.js";
import { hashPhone } from "../utils/crypto.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { DB } from "../db/client.js";
import type { LlmClient } from "../agent/deps.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { EntityKind } from "../db/schema.js";

const ENTITY_KINDS: EntityKind[] = ["person", "place", "money", "date", "topic", "org", "url"];

const EXTRACTION_SYSTEM = `You extract typed entities from one short message.
Reply with a JSON array of {kind, value} objects, no prose, no markdown, no code fence.
kind must be one of: person, place, money, date, topic, org, url.
Skip pronouns and generic words. Skip the user (Nitesh) themselves.
Max 10 entities per message. If none found, reply [].
Examples:
Input: "Sarah at Wattage owes us $4250 by July 15"
Output: [{"kind":"person","value":"Sarah"},{"kind":"org","value":"Wattage"},{"kind":"money","value":"$4250"},{"kind":"date","value":"July 15"}]
Input: "ok"
Output: []`;

export interface ExtractedEntity {
  kind: EntityKind;
  value: string;
}

export function parseEntityJson(text: string): ExtractedEntity[] {
  const trimmed = text.trim();
  // Tolerate optional code fence wrapping.
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ExtractedEntity[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as { kind?: unknown; value?: unknown };
    if (typeof obj.kind !== "string" || typeof obj.value !== "string") continue;
    if (!ENTITY_KINDS.includes(obj.kind as EntityKind)) continue;
    const value = obj.value.trim();
    if (!value || value.length > 500) continue;
    out.push({ kind: obj.kind as EntityKind, value });
    if (out.length >= 10) break;
  }
  return out;
}

export async function extractEntitiesFromText(
  llm: LlmClient,
  text: string,
): Promise<ExtractedEntity[]> {
  if (!text || text.length < 3) return [];
  const truncated = text.slice(0, 2000);
  const resp = await llm.complete({
    system: EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: truncated }],
    maxTokens: 400,
  });
  return parseEntityJson(resp.text);
}

/**
 * Scheduled-tick entry point. Looks back over the last N minutes of owner
 * messages, extracts entities for any that don't have rows yet, batch-inserts.
 * Returns {scanned, extracted, entitiesWritten} for ops visibility.
 */
export async function runAutoEntityExtraction(
  db: DB,
  llm: LlmClient,
  ownerPhone: string,
  args: { lookbackMs?: number; perTickLimit?: number } = {},
): Promise<{ scanned: number; extracted: number; entitiesWritten: number }> {
  const ownerHash = hashPhone(ownerPhone);
  const lookbackMs = args.lookbackMs ?? 15 * 60 * 1000; // 15 min default
  const perTickLimit = args.perTickLimit ?? 10;

  const candidates = await recentMessagesWithoutEntities(db, {
    ownerPhoneHash: ownerHash,
    sinceMs: lookbackMs,
    limit: perTickLimit,
  });
  if (!candidates.length) return { scanned: 0, extracted: 0, entitiesWritten: 0 };

  const tenant = privateOwnerTenantForPhone(ownerPhone);
  let extracted = 0;
  let entitiesWritten = 0;

  for (const msg of candidates) {
    const text = msg.transcript || msg.body || "";
    if (!text) continue;
    try {
      const entitiesList = await extractEntitiesFromText(llm, text);
      if (!entitiesList.length) {
        // Insert a single "topic" sentinel so we don't re-extract empty results.
        // Use the message id itself as the sentinel value — never matches a real entity query.
        await insertEntities(db, tenant, [
          {
            ownerHash,
            kind: "topic",
            value: `__none__${msg.id}`,
            sourceTable: "messages",
            sourceId: msg.id,
            sourceAt: msg.createdAt,
          },
        ]);
        extracted++;
        entitiesWritten++;
        continue;
      }
      const inserted = await insertEntities(
        db,
        tenant,
        entitiesList.map((e) => ({
          ownerHash,
          kind: e.kind,
          value: e.value,
          sourceTable: "messages",
          sourceId: msg.id,
          sourceAt: msg.createdAt,
        })),
      );
      extracted++;
      entitiesWritten += inserted.length;
    } catch {
      // Skip silently; will retry next tick.
    }
  }
  return { scanned: candidates.length, extracted, entitiesWritten };
}

export function registerAutoExtract(registry: ToolRegistry): void {
  registry.register({
    name: "run_entity_extraction_sweep",
    description:
      "Manually trigger one pass of the auto entity-extraction worker. Looks at recent messages " +
      "that don't yet have entity rows and extracts via LLM. Normally fires on a scheduler tick; " +
      "use this tool when the user asks 'index my recent messages' or after a backfill.",
    inputSchema: z.object({
      lookbackMinutes: z.number().int().min(1).max(1440).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    handler: async (input: { lookbackMinutes?: number; limit?: number }, ctx: ToolContext) => {
      const result = await runAutoEntityExtraction(ctx.deps.db, ctx.deps.llm, ctx.userPhone, {
        lookbackMs: (input.lookbackMinutes ?? 15) * 60 * 1000,
        perTickLimit: input.limit ?? 10,
      });
      return result;
    },
  });
}
