import { describe, expect, it } from "vitest";
import { classifyHeartbeat } from "../src/ops/heartbeat.js";

describe("classifyHeartbeat", () => {
  const now = new Date("2026-05-02T10:00:00.000Z");

  it("reports missing when no heartbeat row exists", () => {
    expect(classifyHeartbeat(null, now)).toBe("missing");
  });

  it("reports stale when last seen is older than the threshold", () => {
    expect(
      classifyHeartbeat(
        { lastSeenAt: new Date("2026-05-02T09:56:59.999Z") },
        now,
        3 * 60 * 1000,
      ),
    ).toBe("stale");
  });

  it("reports ok when last seen is inside the threshold", () => {
    expect(
      classifyHeartbeat(
        { lastSeenAt: new Date("2026-05-02T09:58:00.000Z") },
        now,
        3 * 60 * 1000,
      ),
    ).toBe("ok");
  });

  it("reports stale when last seen is far in the future", () => {
    expect(
      classifyHeartbeat(
        { lastSeenAt: new Date("2026-05-02T10:01:00.000Z") },
        now,
        3 * 60 * 1000,
      ),
    ).toBe("stale");
  });
});
