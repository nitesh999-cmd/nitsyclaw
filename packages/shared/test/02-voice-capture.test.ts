import { describe, expect, it } from "vitest";
import { transcribeAndStore } from "../src/features/02-voice-capture.js";
import { fakeTranscriber, makeFakeDb } from "./helpers.js";

const OWNER_HASH = "owner-voice-test";

describe("transcribeAndStore", () => {
  it("transcribes and stores as memory", async () => {
    const { db, state } = makeFakeDb();
    const out = await transcribeAndStore({
      audio: Buffer.from("non-empty"),
      mimetype: "audio/ogg",
      transcriber: fakeTranscriber,
      db,
      ownerHash: OWNER_HASH,
    });
    expect(out.transcript).toContain("transcribed");
    expect(state.memories).toHaveLength(1);
    expect(state.memories[0].kind).toBe("note");
    expect(state.memories[0].tags).toContain("voice");
  });

  it("rejects empty audio", async () => {
    const { db } = makeFakeDb();
    await expect(
      transcribeAndStore({
        audio: Buffer.alloc(0),
        mimetype: "audio/ogg",
        transcriber: fakeTranscriber,
        db,
        ownerHash: OWNER_HASH,
      }),
    ).rejects.toThrow(/empty audio/);
  });

  it("rejects empty transcripts", async () => {
    const { db } = makeFakeDb();
    const t = { async transcribe() { return "   "; } };
    await expect(
      transcribeAndStore({ audio: Buffer.from("x"), mimetype: "audio/ogg", transcriber: t, db, ownerHash: OWNER_HASH }),
    ).rejects.toThrow(/empty/);
  });
});
