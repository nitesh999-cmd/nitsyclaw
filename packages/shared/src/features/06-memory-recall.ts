// Feature 6: Memory recall — "Where did I save the thing about X?"

import { z } from "zod";
import { correctMemory, pinMemory, recallMemoryForOwner } from "../agent/memory.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import { hashPhone } from "../utils/crypto.js";
import { looksLikeStoredPromptInjection, wrapUntrustedContext } from "../local-brain/pa-loop.js";

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
      const ownerHash = hashPhone(ctx.userPhone);
      const results = await recallMemoryForOwner(ctx.deps.db, ownerHash, input.query, input.limit ?? 5);
      const eligible = results
        .filter((row) => !row.tags.some((tag) => tag === "memory:forgotten" || tag === "memory:corrected"))
        .filter((row) => !looksLikeStoredPromptInjection(row.content));
      return {
        count: eligible.length,
        excludedCount: results.length - eligible.length,
        items: eligible.map((r) => ({
          id: r.id,
          kind: r.kind,
          content: wrapUntrustedContext(r.content),
          tags: r.tags,
          source: r.sourceMessageId ? `message:${r.sourceMessageId}` : `memory:${r.id}`,
          confidence: r.tags.includes("confidence:uncertain") ? "uncertain" : r.tags.includes("confidence:inferred") ? "inferred" : "explicit",
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
      if (looksLikeStoredPromptInjection(input.content)) {
        return { status: "rejected", reason: "instruction_like_content" };
      }
      const ownerHash = hashPhone(ctx.userPhone);
      const m = await pinMemory(ctx.deps.db, {
        ownerHash,
        content: input.content,
        tags: input.tags,
        embedder: ctx.deps.embedder,
      });
      return { id: m.id };
    },
  });

  registry.register({
    name: "correct_memory",
    description: "Replace an existing saved memory after the user explicitly corrects it. The old memory is retained as superseded and excluded from future recall.",
    inputSchema: z.object({
      oldQuery: z.string().min(2).describe("A short exact phrase that identifies the old memory"),
      correctedContent: z.string().min(2).describe("The corrected fact or preference to remember"),
      tags: z.array(z.string()).optional(),
    }),
    handler: async (input: { oldQuery: string; correctedContent: string; tags?: string[] }, ctx: ToolContext) => {
      if (looksLikeStoredPromptInjection(input.correctedContent)) {
        return { status: "rejected", reason: "instruction_like_content" };
      }
      const ownerHash = hashPhone(ctx.userPhone);
      const corrected = await correctMemory(ctx.deps.db, {
        ownerHash,
        oldQuery: input.oldQuery,
        correctedContent: input.correctedContent,
        tags: input.tags,
        embedder: ctx.deps.embedder,
      });
      if (!corrected) return { status: "not_found" };
      return { status: "corrected", previousId: corrected.previous.id, replacementId: corrected.replacement.id };
    },
  });
}
