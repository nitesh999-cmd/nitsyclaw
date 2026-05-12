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
    expect(source).toContain("What each failure means");
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
