import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("WhatsApp recovery page", () => {
  test("codifies the recovery checklist without exposing QR or secrets", () => {
    const source = readFileSync("apps/dashboard/src/app/whatsapp-recovery/page.tsx", "utf8");

    expect(source).toContain('getSystemHeartbeat(db, "bot-runtime")');
    expect(source).toContain('getSystemHeartbeat(db, "whatsapp-client")');
    expect(source).toContain('getSystemHeartbeat(db, "whatsapp-send")');
    expect(source).toContain('getSystemHeartbeat(db, "whatsapp-loop-guard")');
    expect(source).toContain("Railway bot worker");
    expect(source).toContain("Phone proof script");
    expect(source).toContain("Recovery action log");
    expect(source).toContain("operatorCommands");
    expect(source).toContain("Local proof, no Railway");
    expect(source).toContain("pnpm run whatsapp:proof-local");
    expect(source).toContain("pnpm run railway:preflight");
    expect(source).toContain("/api/whatsapp-recovery/log-action");
    expect(source).toContain("railway_auth_checked");
    expect(source).toContain("phone_proof_passed");
    expect(source).toContain("whatsapp_recovery_action");
    expect(source).toContain("resume whatsapp");
    expect(source).toContain("phoneProofSteps");
    expect(source).toContain("voice: what is the weather tomorrow?");
    expect(source).toContain("Risk confirmation");
    expect(source).toContain("What each failure means");
    expect(source).toContain("whatsappClientRecoveryDetail");
    expect(source).toContain("WhatsApp is logged out and a QR is ready");
    expect(source).toContain("pnpm run railway:qr-open");
    expect(source).toContain("hi");
    expect(source).toContain("pending items");
    expect(source).toContain("hear it");
    expect(source).not.toContain("qr=");
    expect(source).not.toContain("qrUrl");
    expect(source).not.toContain("api.qrserver.com");
    expect(source).not.toContain("DATABASE_URL");
    expect(source).not.toContain("ANTHROPIC_API_KEY");
  });
});
