import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("WhatsApp recovery action route", () => {
  test("logs only fixed recovery actions through sanitized audit logging", () => {
    const source = readFileSync("apps/dashboard/src/app/api/whatsapp-recovery/log-action/route.ts", "utf8");

    expect(source).toContain("requireSameOrigin");
    expect(source).toContain("checkDashboardRateLimit");
    expect(source).toContain("VALID_ACTIONS");
    expect(source).toContain("railway_auth_checked");
    expect(source).toContain("railway_restarted");
    expect(source).toContain("phone_proof_started");
    expect(source).toContain("phone_proof_passed");
    expect(source).toContain("phone_proof_failed");
    expect(source).toContain("logAudit");
    expect(source).toContain('tool: "whatsapp_recovery_action"');
    expect(source).toContain("Cache-Control");
    expect(source).toContain("no-store");
    expect(source).not.toContain("message");
    expect(source).not.toContain("freeform");
  });
});
