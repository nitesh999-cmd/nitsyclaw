import { describe, expect, it } from "vitest";
import { parseRelativeTime, isInQuietHours, formatBriefDate } from "../src/utils/time.js";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-04-25T03:30:00Z"); // 09:00 IST Saturday

describe("parseRelativeTime", () => {
  it("parses 'in 5 minutes'", () => {
    const r = parseRelativeTime("in 5 minutes", NOW, TZ)!;
    expect(r.recurring).toBe(false);
    expect(r.fireAt.getTime() - NOW.getTime()).toBe(5 * 60 * 1000);
  });

  it("parses 'in 2 hours'", () => {
    const r = parseRelativeTime("in 2 hours", NOW, TZ)!;
    expect(r.fireAt.getTime() - NOW.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("parses 'in 3 days'", () => {
    const r = parseRelativeTime("remind me in 3 days to call dad", NOW, TZ)!;
    const days = (r.fireAt.getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(3, 0);
  });

  it("parses 'tomorrow 7am' in user TZ", () => {
    const r = parseRelativeTime("tomorrow 7am", NOW, TZ)!;
    // Tomorrow 7am IST = 01:30 UTC next day
    expect(r.fireAt.toISOString()).toBe("2026-04-26T01:30:00.000Z");
  });

  it("parses 'today 6pm'", () => {
    const r = parseRelativeTime("today 6pm", NOW, TZ)!;
    expect(r.fireAt.toISOString()).toBe("2026-04-25T12:30:00.000Z");
  });

  it("parses bare time 9pm and rolls past today", () => {
    const r = parseRelativeTime("at 9pm", NOW, TZ)!;
    expect(r.fireAt.toISOString()).toBe("2026-04-25T15:30:00.000Z");
  });

  it("parses 'every monday 9am' as recurring", () => {
    const r = parseRelativeTime("every monday 9am", NOW, TZ)!;
    expect(r.recurring).toBe(true);
    expect(r.fireAt.getDay()).toBe(1); // Monday in local
  });

  it("returns null for 'eat a sandwich'", () => {
    expect(parseRelativeTime("eat a sandwich", NOW, TZ)).toBeNull();
  });

  it("handles edge: empty string", () => {
    expect(parseRelativeTime("", NOW, TZ)).toBeNull();
  });
});

describe("isInQuietHours", () => {
  it("detects mid-window in same-day window", () => {
    expect(isInQuietHours(new Date("2026-04-25T08:30:00Z"), TZ, "13:00", "15:00")).toBe(true); // 14:00 IST
  });

  it("detects outside window", () => {
    expect(isInQuietHours(new Date("2026-04-25T08:30:00Z"), TZ, "20:00", "22:00")).toBe(false);
  });

  it("handles overnight window 22:00 → 07:00", () => {
    // 02:00 IST = 20:30 UTC previous day → use a UTC time that's IST 02:00
    const t = new Date("2026-04-25T20:30:00Z"); // 02:00 IST next day
    expect(isInQuietHours(t, TZ, "22:00", "07:00")).toBe(true);
  });

  it("handles overnight window when it's morning", () => {
    const t = new Date("2026-04-25T01:30:00Z"); // 07:00 IST
    expect(isInQuietHours(t, TZ, "22:00", "07:00")).toBe(false);
  });

  it("handles equal start/end (disabled)", () => {
    expect(isInQuietHours(NOW, TZ, "09:00", "09:00")).toBe(false);
  });
});

describe("formatBriefDate", () => {
  it("formats YYYY-MM-DD in user TZ", () => {
    expect(formatBriefDate(NOW, TZ)).toBe("2026-04-25");
  });
});
