import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("WhatsApp send failure handling", () => {
  test("wraps the shared WhatsApp dependency so every send path is monitored", () => {
    const source = readFileSync("apps/bot/src/index.ts", "utf8");

    expect(source).toContain("WhatsAppSendMonitor");
    expect(source).toContain("whatsapp: monitoredWhatsapp");
    expect(source).toContain("monitoredWhatsapp.onMessage");
  });

  test("records and urgently notifies WhatsApp send failures", () => {
    const source = readFileSync("apps/bot/src/whatsapp-send-monitor.ts", "utf8");

    expect(source).toContain('source: "whatsapp-send"');
    expect(source).toContain('status: "error"');
    expect(source).toContain("NitsyClaw WhatsApp send failed");
    expect(source).toContain('priority: "urgent"');
  });
});
