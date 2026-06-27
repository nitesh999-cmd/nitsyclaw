// Feature 28: Entity graph substrate.
//
// Typed entities (person/place/money/date/topic/org/url) extracted from
// user history. Foundation for contact timeline, pre-meeting briefing,
// orphan radar, "ask my life" recall.
//
// This file ships the manual record + find tools. Automatic LLM-driven
// extraction from insertMessage is next-session work; the LLM can be
// instructed to call record_entity proactively when relevant in the
// meantime.

import { z } from "zod";
import { hashPhone } from "../utils/crypto.js";
import {
  findEntities,
  insertEntities,
  recentEntitiesByKind,
} from "../db/repo.js";
import type { EntityKind } from "../db/schema.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

const ENTITY_KINDS = ["person", "place", "money", "date", "topic", "org", "url"] as const;

export function registerEntityGraph(registry: ToolRegistry): void {
  registry.register({
    name: "record_entities",
    description:
      "Save one or more typed entities extracted from a message, email, or note into the entity graph. " +
      "Use proactively whenever a message mentions a person, place, organization, URL, money amount, " +
      "specific date, or distinct topic. Each entity becomes queryable via find_entities. " +
      "kind values: person, place, money, date, topic, org, url. Provide sourceTable + sourceId so the " +
      "hit can cite back to its origin row (e.g. sourceTable='messages', sourceId='<message uuid>').",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            kind: z.enum(ENTITY_KINDS),
            value: z.string().min(1).max(500),
            sourceTable: z.string().max(60).optional(),
            sourceId: z.string().max(60).optional(),
            sourceAtIso: z.string().optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
    handler: async (
      input: {
        items: Array<{
          kind: EntityKind;
          value: string;
          sourceTable?: string;
          sourceId?: string;
          sourceAtIso?: string;
        }>;
      },
      ctx: ToolContext,
    ) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const rows = input.items.map((it) => ({
        ownerHash,
        kind: it.kind,
        value: it.value,
        sourceTable: it.sourceTable,
        sourceId: it.sourceId,
        sourceAt: it.sourceAtIso ? new Date(it.sourceAtIso) : undefined,
      }));
      const inserted = await insertEntities(
        ctx.deps.db,
        privateOwnerTenantForPhone(ctx.userPhone),
        rows,
      );
      return {
        recorded: inserted.length,
        ids: inserted.map((r) => r.id),
      };
    },
  });

  registry.register({
    name: "find_entities",
    description:
      "Search the entity graph by normalized value (case-insensitive substring). Optionally filter by kind. " +
      "Returns entities ordered by most-recent first. Use to answer 'who is X', 'what did we say about Y', " +
      "'show me people I've mentioned this month'.",
    inputSchema: z.object({
      query: z.string().min(1).max(200),
      kind: z.enum(ENTITY_KINDS).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (
      input: { query: string; kind?: EntityKind; limit?: number },
      ctx: ToolContext,
    ) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const rows = await findEntities(
        ctx.deps.db,
        privateOwnerTenantForPhone(ctx.userPhone),
        { ownerHash, query: input.query, kind: input.kind, limit: input.limit },
      );
      return {
        count: rows.length,
        items: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          value: r.value,
          sourceTable: r.sourceTable,
          sourceId: r.sourceId,
          sourceAt: r.sourceAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  });

  registry.register({
    name: "recent_entities_by_kind",
    description:
      "List recent entities of a given kind for the user. Useful for 'who have I been talking about lately' " +
      "(kind=person), 'what topics have come up' (kind=topic), 'recent money amounts mentioned' (kind=money).",
    inputSchema: z.object({
      kind: z.enum(ENTITY_KINDS),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    handler: async (input: { kind: EntityKind; limit?: number }, ctx: ToolContext) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const rows = await recentEntitiesByKind(
        ctx.deps.db,
        privateOwnerTenantForPhone(ctx.userPhone),
        { ownerHash, kind: input.kind, limit: input.limit },
      );
      return {
        kind: input.kind,
        count: rows.length,
        items: rows.map((r) => ({
          id: r.id,
          value: r.value,
          sourceTable: r.sourceTable,
          sourceId: r.sourceId,
          sourceAt: r.sourceAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  });
}
