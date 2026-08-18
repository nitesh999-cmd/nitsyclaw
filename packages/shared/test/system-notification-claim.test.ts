import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { claimSystemNotification } from "../src/db/repo.js";

describe("claimSystemNotification", () => {
  const args = {
    source: "build-agent-feature-ntfy-rate-limit",
    fingerprint: "pending-feature-summary",
    now: new Date("2026-05-09T05:00:00.000Z"),
    cooldownMs: 20 * 60 * 60 * 1000,
    metadata: { pendingCount: 1 },
  };

  it.each([
    { name: "drizzle array row", result: [{ source: args.source }] },
    { name: "node rows", result: { rows: [{ source: args.source }] } },
    { name: "rowCount", result: { rowCount: 1 } },
  ])("treats $name as a claimed notification", async ({ result }) => {
    const db = { execute: vi.fn().mockResolvedValue(result) };

    await expect(claimSystemNotification(db as never, args)).resolves.toBe(true);
  });

  it.each([
    { name: "empty drizzle array", result: [] },
    { name: "empty node rows", result: { rows: [] } },
    { name: "zero rowCount", result: { rowCount: 0 } },
  ])("treats $name as a suppressed duplicate", async ({ result }) => {
    const db = { execute: vi.fn().mockResolvedValue(result) };

    await expect(claimSystemNotification(db as never, args)).resolves.toBe(false);
  });

  it("binds raw SQL timestamps as strings for postgres-js", async () => {
    const db = { execute: vi.fn().mockResolvedValue([]) };

    await claimSystemNotification(db as never, args);

    const query = db.execute.mock.calls[0]?.[0];
    const compiled = new PgDialect().sqlToQuery(query as never);
    expect(compiled.params[1]).toBe("2026-05-09T05:00:00.000Z");
    expect(compiled.params[4]).toBe("2026-05-08T09:00:00.000Z");
    expect(compiled.params[1]).not.toBeInstanceOf(Date);
    expect(compiled.params[4]).not.toBeInstanceOf(Date);
    expect(compiled.sql.match(/::timestamptz/g)).toHaveLength(4);
  });
});
