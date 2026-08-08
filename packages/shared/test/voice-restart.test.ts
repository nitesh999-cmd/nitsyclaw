import { describe, expect, it } from "vitest";
import { recoverInterruptedVoiceCommandJobs } from "../src/db/repo.js";
import { getFakeDbState, makeFakeDb } from "./helpers.js";

describe("voice restart recovery", () => {
  it("fails only interrupted owner voice jobs and never replays or crosses into text jobs", async () => {
    const { db } = makeFakeDb();
    const state = getFakeDbState(db);
    const ownerHash = "owner-hash";
    const now = new Date("2026-08-09T00:00:00Z");
    state.messages.push(
      {
        id: "voice-working",
        direction: "in",
        surface: "whatsapp",
        fromNumber: ownerHash,
        body: "encrypted",
        mediaType: "voice",
        createdAt: now,
      },
      {
        id: "voice-done",
        direction: "in",
        surface: "whatsapp",
        fromNumber: ownerHash,
        body: "encrypted",
        mediaType: "voice",
        createdAt: now,
      },
      {
        id: "text-working",
        direction: "in",
        surface: "whatsapp",
        fromNumber: ownerHash,
        body: "encrypted",
        mediaType: null,
        createdAt: now,
      },
    );
    state.command_jobs.push(
      {
        id: "job-voice-working",
        source: "whatsapp",
        ownerHash,
        sourceMessageId: "voice-working",
        command: "encrypted",
        status: "working",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-voice-done",
        source: "whatsapp",
        ownerHash,
        sourceMessageId: "voice-done",
        command: "encrypted",
        status: "done",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-text-working",
        source: "whatsapp",
        ownerHash,
        sourceMessageId: "text-working",
        command: "encrypted",
        status: "working",
        createdAt: now,
        updatedAt: now,
      },
    );

    await expect(recoverInterruptedVoiceCommandJobs(db, ownerHash)).resolves.toBe(1);
    expect(state.command_jobs.find((job) => job.id === "job-voice-working")).toMatchObject({
      status: "failed",
      error: "Voice request interrupted by process restart; not replayed automatically.",
    });
    expect(state.command_jobs.find((job) => job.id === "job-voice-done")?.status).toBe("done");
    expect(state.command_jobs.find((job) => job.id === "job-text-working")?.status).toBe("working");
  });

  it("does nothing when the owner has no retained voice jobs", async () => {
    const { db } = makeFakeDb();
    await expect(recoverInterruptedVoiceCommandJobs(db, "owner-hash")).resolves.toBe(0);
  });
});
