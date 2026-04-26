// Feature 6: Memory recall — "Where did I save the thing about X?"

import { z } from "zod";
import { recallMemory } from "../agent/memory.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export function registerMemoryRecall(registry: ToolRegistry): void {
  registry.register({
    name: "recall_memory",
    description:
      "Search the user's saved memories (notes, pins, voice transcripts) by query string. Returns up to 5 candidates ranked by relevance.",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    handler: async (input: { query: string; limit?: number }, ctx: ToolContext) => {
      const results = await recallMemory(ctx.deps.db, input.query, input.limit ?? 5);
      return {
        count: results.length,
        items: results.map((r) => ({
          id: r.id,
          kind: r.kind,
          content: r.content,
          tags: r.tags,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  });

  registry.register({
    name: "pin_memory",
    description: "Pin a fact or note for long-term recall.",
    inputSchema: z.object({
      content: z.string().min(2),
      tags: z.array(z.string()).optional(),
    }),
    handler: async (input: { content: string; tags?: string[] }, ctx: ToolContext) => {
      const { pinMemory } = await import("../agent/memory.js");
      const m = await pinMemory(ctx.deps.db, {
        content: input.content,
        tags: input.tags,
        embedder: ctx.deps.embedder,
      });
      return { id: m.id };
    },
  });
}
