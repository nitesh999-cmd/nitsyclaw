import { describe, expect, it } from "vitest";
import { resolveConfirmation } from "../src/features/09-confirmation-rail.js";
import { makeFakeDb } from "./helpers.js";

const NOW = new Date("2026-04-25T08:00:00Z");

describe("resolveConfirmation", () => {
  it("approves when reply is 'y' and confirmation pending", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "create_calendar_event",
      payload: { title: "x" },
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });
    const out = await resolveConfirmation({ db: db as any, reply: "yes", now: NOW });
    expect(out?.decision).toBe("approved");
  });

  it("rejects when reply is 'n'", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "x",
      payload: {},
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });
    const out = await resolveConfirmation({ db: db as any, reply: "no", now: NOW });
    expect(out?.decision).toBe("rejected");
  });

  it("expires when past expiresAt", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "x",
      payload: {},
      status: "pending",
      expiresAt: new Date("2026-04-25T07:00:00Z"),
      createdAt: NOW,
    });
    const out = await resolveConfirmation({ db: db as any, reply: "y", now: NOW });
    expect(out?.decision).toBe("expired");
  });

  it("returns null on non-y/n reply", async () => {
    const { db } = makeFakeDb();
    const out = await resolveConfirmation({ db: db as any, reply: "maybe", now: NOW });
    expect(out).toBeNull();
  });

  it("returns null when nothing pending", async () => {
    const { db } = makeFakeDb();
    const out = await resolveConfirmation({ db: db as any, reply: "y", now: NOW });
    expect(out).toBeNull();
  });
});
