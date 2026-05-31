import { describe, expect, it } from "vitest";
import {
  formatDriveConnectorStatusForWhatsApp,
  getDriveConnectorStatus,
} from "../src/integrations/drive-connector.js";

describe("Drive connector status", () => {
  it("reports setup missing without pretending Drive is ready", () => {
    const status = getDriveConnectorStatus({});

    expect(status.state).toBe("needs_setup");
    expect(status.missing).toContain("GOOGLE_CREDENTIALS_JSON");
    expect(status.summary).not.toMatch(/ready|available/i);
    expect(status.safetyRules.join(" ")).toContain("selected-file access");
  });

  it("requires account connection when only OAuth app exists", () => {
    const status = getDriveConnectorStatus({ GOOGLE_CREDENTIALS_JSON: "{}" });

    expect(status.state).toBe("needs_account");
    expect(status.missing).toContain("Google account token");
    expect(status.enabled).toContain("setup request queue");
  });

  it("requires selected-file adapter when a Google token exists", () => {
    const status = getDriveConnectorStatus({ GOOGLE_TOKEN_JSON_PERSONAL: "{}" });

    expect(status.state).toBe("needs_adapter");
    expect(status.missing).toContain("selected-file Drive adapter");
    expect(status.safetyRules.join(" ")).toContain("Show filename/source");
  });

  it("reports selected-file import when token and adapter exist", () => {
    const status = getDriveConnectorStatus({
      GOOGLE_TOKEN_JSON: "{}",
      GOOGLE_DRIVE_SELECTED_FILE_ADAPTER: "enabled",
    });

    expect(status.state).toBe("ready");
    expect(status.enabled).toContain("selected-file import");
    expect(status.missing).toHaveLength(0);
  });

  it("formats a user-safe WhatsApp reply", () => {
    const reply = formatDriveConnectorStatusForWhatsApp(getDriveConnectorStatus({}));

    expect(reply).toContain("Google Drive connector");
    expect(reply).toContain("Status: needs setup");
    expect(reply).toContain("GOOGLE_CREDENTIALS_JSON");
    expect(reply).toContain("Sharing, deleting, moving, or editing files stays blocked");
  });
});
