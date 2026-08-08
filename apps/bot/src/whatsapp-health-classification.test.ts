import { describe, expect, it } from "vitest";
import type { SystemHeartbeat } from "@nitsyclaw/shared/db";
import { classifyWhatsAppHealthSignal } from "./whatsapp-health-classification.js";

const now = new Date("2026-08-07T11:00:00.000Z");

function heartbeat(status: string, ageMs = 0): SystemHeartbeat {
  const lastSeenAt = new Date(now.getTime() - ageMs);
  return {
    id: crypto.randomUUID(),
    source: "test",
    status,
    lastSeenAt,
    metadata: {},
    updatedAt: lastSeenAt,
  };
}

describe("WhatsApp health classification", () => {
  it("uses explicit, non-overlapping operational states", () => {
    const classify = (value: SystemHeartbeat | null, kind: "periodic" | "event" = "periodic") =>
      classifyWhatsAppHealthSignal({ heartbeat: value, now, staleAfterMs: 60_000, kind });

    expect(classify(heartbeat("ok"))).toBe("healthy");
    expect(classify(heartbeat("ok", 61_000), "event")).toBe("idle");
    expect(classify(heartbeat("ok", 61_000))).toBe("stale");
    expect(classify(heartbeat("degraded"))).toBe("degraded");
    expect(classify(heartbeat("error"))).toBe("failed");
    expect(classify(null)).toBe("not tested");
    expect(classify(heartbeat("not_applicable"))).toBe("not applicable");
  });
});
