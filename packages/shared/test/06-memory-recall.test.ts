import { describe, expect, it } from "vitest";
import { pinMemory, recallMemory } from "../src/agent/memory.js";
import { makeFakeDb, fakeEmbedder } from "./helpers.js";

describe("memory recall", () => {
  it("pin → recall round trip (lexical fallback)", async () => {
    const { db, state } = makeFakeDb();
    await pinMemory(db as any, { content: "Notion db for finance lives at /finance", tags: ["finance"] });
    expect(state.memories).toHaveLength(1);
    // Lexical search: substring match
    const got = await recallMemory(db as any, "finance");
    // fake-db where() returns all rows; assert content matches
    expect(got.find((m: any) => m.content.includes("finance"))).toBeTruthy();
  });

  it("pin with embedder stores embedding", async () => {
    const { db, state } = makeFakeDb();
    await pinMemory(db as any, { content: "x", embedder: fakeEmbedder });
    expect(state.memories[0].embedding).toBeTruthy();
  });
});
