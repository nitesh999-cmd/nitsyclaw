import { describe, expect, it } from "vitest";
import { pinMemory, recallMemoryForOwner } from "../src/agent/memory.js";
import { makeFakeDb, fakeEmbedder } from "./helpers.js";

const OWNER_HASH = "owner-memory-test";

describe("memory recall", () => {
  it("pin → recall round trip (lexical fallback)", async () => {
    const { db, state } = makeFakeDb();
    await pinMemory(db, { ownerHash: OWNER_HASH, content: "Notion db for finance lives at /finance", tags: ["finance"] });
    expect(state.memories).toHaveLength(1);
    // Lexical search: substring match
    const got = await recallMemoryForOwner(db, OWNER_HASH, "finance");
    // fake-db where() returns all rows; assert content matches
    expect(got.find((m) => m.content.includes("finance"))).toBeTruthy();
  });

  it("pin with embedder stores embedding", async () => {
    const { db, state } = makeFakeDb();
    await pinMemory(db, { ownerHash: OWNER_HASH, content: "x", embedder: fakeEmbedder });
    expect(state.memories[0].embedding).toBeTruthy();
  });
});
