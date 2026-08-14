import { describe, expect, it, vi } from "vitest";
import { claimScheduledRun, scheduledRunKey } from "./scheduled-run-guard.js";

describe("scheduled run guard", () => {
  it("uses the Melbourne calendar date across UTC rollover", () => {
    expect(
      scheduledRunKey("focus-closeout", new Date("2026-08-07T13:59:59Z"), "Australia/Melbourne", "daily"),
    ).toBe("focus-closeout:2026-08-07");
    expect(
      scheduledRunKey("focus-closeout", new Date("2026-08-07T14:00:00Z"), "Australia/Melbourne", "daily"),
    ).toBe("focus-closeout:2026-08-08");
  });

  it("suppresses the same scheduled job after a process restart", async () => {
    const seen = new Set<string>();
    const claim = vi.fn(async (_db, args: { fingerprint: string }) => {
      if (seen.has(args.fingerprint)) return false;
      seen.add(args.fingerprint);
      return true;
    });
    const args = {
      name: "nightly-whatsapp-health",
      now: new Date("2026-08-07T11:00:00Z"),
      timezone: "Australia/Melbourne",
      cadence: "daily" as const,
    };

    await expect(claimScheduledRun({} as never, args, claim as never)).resolves.toBe(true);
    await expect(claimScheduledRun({} as never, args, claim as never)).resolves.toBe(false);
    expect(claim.mock.calls[0]?.[1]).toMatchObject({
      source: "scheduler-run:nightly-whatsapp-health",
      fingerprint: "nightly-whatsapp-health:2026-08-07",
    });
  });
});
