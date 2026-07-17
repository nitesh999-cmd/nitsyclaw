import type { DB } from "../db/client.js";
import { insertMemory, searchMemoriesLexical } from "../db/repo.js";
import { privateOwnerTenant } from "../tenancy.js";
import type { Embedder } from "./deps.js";
import { mergeMemoryQualityTags } from "./memory-quality.js";

/**
 * Pin: store an explicit "remember this" memory.
 */
export async function pinMemory(
  db: DB,
  args: { ownerHash: string; content: string; tags?: string[]; embedder?: Embedder; sourceMessageId?: string },
) {
  const embedding = args.embedder ? JSON.stringify(await args.embedder.embed(args.content)) : null;
  return insertMemory(db, privateOwnerTenant(args.ownerHash), {
    kind: "pin",
    content: args.content,
    tags: mergeMemoryQualityTags(args.content, args.tags ?? []),
    embedding,
    sourceMessageId: args.sourceMessageId,
  });
}

/**
 * Recall: lexical search for v1; pgvector cosine search added later.
 * Returning structured candidates so the LLM can rerank.
 */
export async function recallMemory(_db: DB, _query: string, _limit = 5) {
  throw new Error("owner hash is required for memory recall");
}

export async function recallMemoryForOwner(db: DB, ownerHash: string, query: string, limit = 5) {
  return searchMemoriesLexical(db, privateOwnerTenant(ownerHash), query, limit);
}
