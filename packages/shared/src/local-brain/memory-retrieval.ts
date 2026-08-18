import type { Embedder } from "../agent/deps.js";
import { looksLikeStoredPromptInjection, wrapUntrustedContext } from "./pa-loop.js";

export interface LocalMemoryCandidate {
  id: string;
  ownerHash: string;
  content: string;
  kind: string;
  tags: string[];
  createdAt: Date | string;
  sourceMessageId?: string | null;
}

export interface RetrievedLocalMemory {
  id: string;
  content: string;
  wrappedContent: string;
  kind: string;
  tags: string[];
  source: string;
  timestamp: string;
  confidence: "explicit" | "inferred" | "uncertain";
  score: number;
  instructionLike: boolean;
}

export async function retrieveMemoriesWithLocalEmbeddings(args: {
  ownerHash: string;
  query: string;
  candidates: LocalMemoryCandidate[];
  embedder: Embedder;
  limit?: number;
}): Promise<RetrievedLocalMemory[]> {
  const safeCandidates = args.candidates
    .filter((candidate) => candidate.ownerHash === args.ownerHash)
    .filter((candidate) => !candidate.tags.some((tag) => tag === "memory:forgotten" || tag === "memory:corrected"))
    .slice(0, 30);
  if (!safeCandidates.length) return [];

  const queryVector = await args.embedder.embed(`search_query: ${args.query.slice(0, 2_000)}`);
  const rows = await Promise.all(safeCandidates.map(async (candidate) => {
    const instructionLike = looksLikeStoredPromptInjection(candidate.content);
    const vector = await args.embedder.embed(`search_document: ${candidate.content.slice(0, 2_000)}`);
    const similarity = cosineSimilarity(queryVector, vector);
    const confidence = memoryConfidence(candidate.tags);
    const confidenceBoost = confidence === "explicit" ? 0.08 : confidence === "inferred" ? 0.03 : -0.08;
    const injectionPenalty = instructionLike ? 1 : 0;
    return {
      id: candidate.id,
      content: candidate.content,
      wrappedContent: wrapUntrustedContext(candidate.content),
      kind: candidate.kind,
      tags: candidate.tags,
      source: candidate.sourceMessageId ? `message:${candidate.sourceMessageId}` : `memory:${candidate.id}`,
      timestamp: new Date(candidate.createdAt).toISOString(),
      confidence,
      score: roundScore(similarity + confidenceBoost - injectionPenalty),
      instructionLike,
    } satisfies RetrievedLocalMemory;
  }));

  return rows
    .filter((row) => !row.instructionLike)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit ?? 5);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function memoryConfidence(tags: string[]): RetrievedLocalMemory["confidence"] {
  if (tags.includes("confidence:uncertain")) return "uncertain";
  if (tags.includes("confidence:inferred")) return "inferred";
  return "explicit";
}

function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
