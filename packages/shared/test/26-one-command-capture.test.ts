import { describe, expect, it } from "vitest";
import { privateOwnerTenant } from "../src/tenancy.js";
import {
  executeOneCommandCapture,
  parseExplicitOneCommandCapture,
} from "../src/ops/one-command-capture.js";
import { makeFakeDb } from "./helpers.js";

describe("one-command capture", () => {
  it("only captures explicit prefixed commands", () => {
    expect(parseExplicitOneCommandCapture("idea: sell this as WhatsApp admin")).toMatchObject({
      kind: "idea",
      body: "sell this as WhatsApp admin",
    });
    expect(parseExplicitOneCommandCapture("what is the weather tomorrow")).toBeNull();
  });

  it("saves simple notes to memory without external action", async () => {
    const { db, state } = makeFakeDb();
    const result = await executeOneCommandCapture({
      db,
      tenant: privateOwnerTenant("owner"),
      text: "idea: make the demo focus on bills and receipts",
      source: "whatsapp",
      requestedBy: "owner",
      now: new Date("2026-05-31T00:00:00Z"),
      timezone: "Australia/Melbourne",
    });

    expect(result?.reply).toContain("Captured idea");
    expect(result?.reply).toContain("No external action was taken");
    expect(state.memories).toHaveLength(1);
    expect(state.memories[0]).toMatchObject({
      kind: "note",
      content: "make the demo focus on bills and receipts",
      tags: ["capture", "idea"],
    });
  });

  it("queues bug captures as build work", async () => {
    const { db, state } = makeFakeDb();
    const result = await executeOneCommandCapture({
      db,
      tenant: privateOwnerTenant("owner"),
      text: "bug: feature queue should not recommend setup-heavy work first",
      source: "dashboard",
      requestedBy: "owner",
      now: new Date("2026-05-31T00:00:00Z"),
      timezone: "Australia/Melbourne",
    });

    expect(result?.reply).toContain("Bug queued");
    expect(state.feature_requests).toHaveLength(1);
    expect(state.feature_requests[0]).toMatchObject({
      type: "bug",
      severity: "P2",
      size: "S",
      source: "dashboard",
    });
  });

  it("logs explicit expense captures in AUD by default", async () => {
    const { db, state } = makeFakeDb();
    const result = await executeOneCommandCapture({
      db,
      tenant: privateOwnerTenant("owner"),
      text: "expense: $18.40 at Chemist Warehouse for medicine",
      source: "whatsapp",
      requestedBy: "owner",
      now: new Date("2026-05-31T00:00:00Z"),
      timezone: "Australia/Melbourne",
    });

    expect(result?.reply).toContain("Expense logged: AUD 18.40");
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0]).toMatchObject({
      amount: 1840,
      currency: "AUD",
      merchant: "Chemist Warehouse",
    });
  });
});
