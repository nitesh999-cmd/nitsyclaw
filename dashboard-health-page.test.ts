import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard health page", () => {
  test("surfaces WhatsApp client heartbeat from the database", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain('getSystemHeartbeat(db, "whatsapp-client")');
    expect(source).toContain("WhatsApp client");
    expect(source).toContain("whatsappFreshness");
  });

  test("does not expose WhatsApp QR payloads", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).not.toContain("qr=");
    expect(source).not.toContain("qrUrl");
    expect(source).not.toContain("api.qrserver.com");
  });
});
