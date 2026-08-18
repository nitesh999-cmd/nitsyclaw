import { describe, expect, it } from "vitest";
import { formatLocalDateInstruction, resolveLocalDateContext } from "../src/search/local-date.js";

const MELBOURNE = "Australia/Melbourne";

describe("resolveLocalDateContext", () => {
  it("reports the Melbourne date for the live-proof instant, not the UTC date", () => {
    // 2026-07-28T16:05Z is 2026-07-29 02:05 AEST (UTC+10). The failed proof
    // answered "today, July 28, 2026" from the UTC day.
    const context = resolveLocalDateContext(new Date("2026-07-28T16:05:48.393Z"), MELBOURNE);

    expect(context.isoDate).toBe("2026-07-29");
    expect(context.label).toContain("29 July 2026");
    expect(context.label).toContain("Wednesday");
    expect(context.isoDate).not.toBe("2026-07-28");
  });

  it("never describes a Melbourne 29 July as 28 July across the whole post-midnight window", () => {
    // Every UTC instant that maps to 29 July in Melbourne during AEST.
    for (const utc of [
      "2026-07-28T14:00:00Z", // 00:00 AEST 29 July, exactly midnight
      "2026-07-28T14:00:01Z",
      "2026-07-28T16:05:48Z",
      "2026-07-28T20:30:00Z",
      "2026-07-29T13:59:59Z", // 23:59:59 AEST 29 July
    ]) {
      const context = resolveLocalDateContext(new Date(utc), MELBOURNE);
      expect(context.isoDate, utc).toBe("2026-07-29");
      expect(context.label, utc).toContain("29 July 2026");
      expect(context.label, utc).not.toContain("28 July");
    }
  });

  it("still reports 28 July for instants genuinely before Melbourne midnight", () => {
    const context = resolveLocalDateContext(new Date("2026-07-28T13:59:59Z"), MELBOURNE);

    expect(context.isoDate).toBe("2026-07-28");
    expect(context.label).toContain("28 July 2026");
  });

  it("handles the daylight-saving offset, not a fixed +10", () => {
    // January is AEDT (UTC+11): 13:30Z is already the next local day.
    const aedt = resolveLocalDateContext(new Date("2026-01-01T13:30:00Z"), MELBOURNE);
    expect(aedt.isoDate).toBe("2026-01-02");

    // The same wall clock in July (AEST, UTC+10) is still the same local day.
    const aest = resolveLocalDateContext(new Date("2026-07-01T13:30:00Z"), MELBOURNE);
    expect(aest.isoDate).toBe("2026-07-01");
  });

  it("falls back to the product default rather than UTC when the timezone is unusable", () => {
    for (const zone of [undefined, "", "   ", "Not/AZone"]) {
      const context = resolveLocalDateContext(new Date("2026-07-28T16:05:00Z"), zone);
      expect(context.timezone).toBe(MELBOURNE);
      expect(context.isoDate).toBe("2026-07-29");
    }
  });

  it("honours a different configured timezone", () => {
    const context = resolveLocalDateContext(new Date("2026-07-28T16:05:00Z"), "Asia/Kolkata");
    expect(context.timezone).toBe("Asia/Kolkata");
    expect(context.isoDate).toBe("2026-07-28");
  });
});

describe("formatLocalDateInstruction", () => {
  it("pins today to the local date and forbids the UTC date", () => {
    const instruction = formatLocalDateInstruction(
      resolveLocalDateContext(new Date("2026-07-28T16:05:00Z"), MELBOURNE),
    );

    expect(instruction).toContain("Australia/Melbourne");
    expect(instruction).toContain("2026-07-29");
    expect(instruction).toContain("29 July 2026");
    expect(instruction).toContain("never the UTC date");
    expect(instruction).not.toContain("2026-07-28");
  });
});
