import { describe, expect, it, vi } from "vitest";
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
});
