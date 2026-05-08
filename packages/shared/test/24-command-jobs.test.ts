import { describe, expect, it } from "vitest";
import { makeFakeDb } from "./helpers.js";
import {
  completeCommandJob,
  createCommandJob,
  recordCommandJobFailure,
} from "../src/ops/command-jobs.js";

describe("command execution jobs", () => {
  it("turns a normal human command into a durable received job with a receipt", async () => {
    const { db, state } = makeFakeDb();

    const job = await createCommandJob(db, {
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "I have a new plan for GridBeater. Build the first version.",
      sourceMessageId: "msg-1",
    });

    expect(job.status).toBe("received");
    expect(job.riskLevel).toBe("safe");
    expect(job.receiptText).toContain("Saved");
    expect(job.receiptText).toContain("Working on it");
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "I have a new plan for GridBeater. Build the first version.",
    });
  });

  it("approval-gates risky commands instead of pretending they can auto-run", async () => {
    const { db } = makeFakeDb();

    const job = await createCommandJob(db, {
      source: "dashboard",
      ownerHash: "owner-hash",
      command: "Send this message to Sarah and delete the old records.",
    });

    expect(job.status).toBe("needs_approval");
    expect(job.riskLevel).toBe("approval_required");
    expect(job.receiptText).toContain("Needs your approval");
  });

  it("stores unclear emotional commands as clarification jobs instead of running them", async () => {
    const { db } = makeFakeDb();

    const job = await createCommandJob(db, {
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "I can't deal with this anymore, this is too much",
    });

    expect(job.status).toBe("needs_clarification");
    expect(job.riskLevel).toBe("safe");
    expect(job.receiptText).toContain("What is the main thing");
  });

  it("can let voice transcripts reach the agent for multilingual clarification", async () => {
    const { db } = makeFakeDb();

    const job = await createCommandJob(db, {
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "వాతావరణం రేపు ఎలా ఉంది",
      allowAgentClarification: true,
    });

    expect(job.status).toBe("received");
    expect(job.riskLevel).toBe("safe");
    expect(job.receiptText).toContain("Saved");
    expect(job.receiptText).toContain("Working on it");
  });

  it("still approval-gates risky voice transcripts", async () => {
    const { db } = makeFakeDb();

    const job = await createCommandJob(db, {
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "send this message to Mukesh",
      allowAgentClarification: true,
    });

    expect(job.status).toBe("needs_approval");
    expect(job.riskLevel).toBe("approval_required");
  });

  it("returns the existing command job when the same dedupe key is queued twice", async () => {
    const { db, state } = makeFakeDb();

    await createCommandJob(db, {
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "Check the weather.",
      dedupeKey: "whatsapp:other-message",
    });
    const first = await createCommandJob(db, {
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "Add this plan to the build queue.",
      dedupeKey: "whatsapp:message-1",
    });

    const duplicate = await createCommandJob(db, {
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "Add this plan to the build queue again.",
      dedupeKey: "whatsapp:message-1",
    });

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.command).toBe("Add this plan to the build queue.");
    expect(state.command_jobs).toHaveLength(2);
  });

  it("records failures as retrying first, then failed after retry budget is exhausted", async () => {
    const { db } = makeFakeDb();
    const job = await createCommandJob(db, {
      source: "dashboard",
      ownerHash: "owner-hash",
      command: "Read this bill and tell me what to do.",
      maxAttempts: 2,
    });

    const retrying = await recordCommandJobFailure(db, job.id, new Error("temporary provider outage"), {
      now: new Date("2026-05-07T10:00:00Z"),
    });
    expect(retrying.status).toBe("retrying");
    expect(retrying.attempts).toBe(1);
    expect(retrying.nextRunAt?.toISOString()).toBe("2026-05-07T10:01:00.000Z");

    const failed = await recordCommandJobFailure(db, job.id, new Error("provider still down"), {
      now: new Date("2026-05-07T10:01:00Z"),
    });
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(2);
    expect(failed.error).toBe("provider still down");
  });

  it("redacts private data from persisted command job errors", async () => {
    const { db } = makeFakeDb();
    const job = await createCommandJob(db, {
      source: "dashboard",
      ownerHash: "owner-hash",
      command: "Check my private account safely.",
      maxAttempts: 1,
    });

    const failed = await recordCommandJobFailure(
      db,
      job.id,
      new Error("OpenAI failed for nitesh@example.com +61430008008 sk-test-secret-1234567890"),
    );

    expect(failed.status).toBe("failed");
    expect(failed.error).not.toContain("nitesh@example.com");
    expect(failed.error).not.toContain("+61430008008");
    expect(failed.error).not.toContain("sk-test-secret");
    expect(failed.error).toContain("[redacted");
  });

  it("marks completed jobs done with a user-visible result", async () => {
    const { db } = makeFakeDb();
    const job = await createCommandJob(db, {
      source: "dashboard",
      ownerHash: "owner-hash",
      command: "Summarise my electricity bill.",
    });

    const done = await completeCommandJob(db, job.id, "Done. Your bill is due Friday.");

    expect(done.status).toBe("done");
    expect(done.resultText).toBe("Done. Your bill is due Friday.");
    expect(done.completedAt).toBeInstanceOf(Date);
  });
});
