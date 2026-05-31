import { describe, expect, it } from "vitest";
import {
  formatOutlookConnectorStatusForWhatsApp,
  getOutlookConnectorStatus,
} from "../src/integrations/outlook-connector.js";

describe("Outlook connector status", () => {
  it("reports setup missing without pretending Outlook is ready", () => {
    const status = getOutlookConnectorStatus({});

    expect(status.state).toBe("needs_setup");
    expect(status.missing).toContain("MS_CLIENT_ID");
    expect(status.summary).not.toMatch(/ready|available/i);
    expect(status.safetyRules.join(" ")).toContain("Automatic sending is not exposed");
  });

  it("reports account connection as the next gate when app registration exists", () => {
    const status = getOutlookConnectorStatus({ MS_CLIENT_ID: "client-id" });

    expect(status.state).toBe("needs_account");
    expect(status.missing).toContain("Microsoft account token");
    expect(status.enabled).toContain("setup request queue");
  });

  it("reports unread summary and draft rails when a token exists", () => {
    const status = getOutlookConnectorStatus({ MS_TOKEN_JSON: "{}" });

    expect(status.state).toBe("ready");
    expect(status.enabled).toContain("unread summaries");
    expect(status.enabled).toContain("draft request queue");
    expect(status.safetyRules.join(" ")).toContain("approval-gated");
  });

  it("formats a user-safe WhatsApp reply", () => {
    const reply = formatOutlookConnectorStatusForWhatsApp(getOutlookConnectorStatus({}));

    expect(reply).toContain("Outlook connector");
    expect(reply).toContain("Status: needs setup");
    expect(reply).toContain("MS_CLIENT_ID");
    expect(reply).toContain("Automatic sending is not exposed");
  });
});
