import { describe, expect, it } from "vitest";
import {
  formatGmailConnectorStatusForWhatsApp,
  getGmailConnectorStatus,
} from "../src/integrations/gmail-connector.js";

describe("Gmail connector status", () => {
  it("reports setup missing without pretending Gmail is connected", () => {
    const status = getGmailConnectorStatus({});

    expect(status.state).toBe("needs_setup");
    expect(status.missing).toContain("GOOGLE_CREDENTIALS_JSON");
    expect(status.summary).not.toMatch(/ready|available/i);
    expect(status.safetyRules.join(" ")).toContain("not automatic");
  });

  it("reports account connection as the next gate when OAuth app exists", () => {
    const status = getGmailConnectorStatus({ GOOGLE_CREDENTIALS_JSON: "{}" });

    expect(status.state).toBe("needs_account");
    expect(status.missing).toContain("Google account token");
    expect(status.enabled).toContain("setup request queue");
  });

  it("reports read/search and draft rails when a token exists", () => {
    const status = getGmailConnectorStatus({ GOOGLE_TOKEN_JSON_PERSONAL: "{}" });

    expect(status.state).toBe("ready");
    expect(status.enabled).toContain("read-only search");
    expect(status.enabled).toContain("draft request queue");
    expect(status.safetyRules.join(" ")).toContain("Draft creation needs explicit approval");
  });

  it("formats a user-safe WhatsApp reply", () => {
    const reply = formatGmailConnectorStatusForWhatsApp(getGmailConnectorStatus({}));

    expect(reply).toContain("Gmail connector");
    expect(reply).toContain("Status: needs setup");
    expect(reply).toContain("Sending is not automatic");
    expect(reply).toContain("Try:");
  });
});
