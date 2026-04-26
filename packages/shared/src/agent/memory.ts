import type { DB } from "../db/client.js";
import { insertMemory, searchMemoriesLexical } from "../db/repo.js";
import type { Embedder } from "./deps.js";

/**
 * Pin: store an explicit "remember this" memory.
 */
export async function pinMemory(
  db: DB,
  args: { content: string; tags?: string[]; embedder?: Embedder; sourceMessageId?: string },
) {
  const embedding = args.embedder ? JSON.stringify(await args.embedder.embed(args.content)) : null;
  return insertMemory(db, {
    kind: "pin",
    content: args.content,
    tags: args.tags ?? [],
    embedding,
    sourceMessageId: args.sourceMessageId,
  });
}

/**
 * Recall: lexical search for v1; pgvector cosine search added later.
 * Returning structured candidates so the LLM can rerank.
 */
export async function recallMemory(db: DB, query: string, limit = 5) {
  return searchMemoriesLexical(db, query, limit);
}
