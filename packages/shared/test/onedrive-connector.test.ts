import { describe, expect, it } from "vitest";
import {
  formatOneDriveConnectorStatusForWhatsApp,
  getOneDriveConnectorStatus,
} from "../src/integrations/onedrive-connector.js";

describe("OneDrive connector status", () => {
  it("stays honest when no Microsoft setup exists", () => {
    const status = getOneDriveConnectorStatus({});

    expect(status.state).toBe("needs_setup");
    expect(status.summary).toContain("OneDrive is not connected");
    expect(status.missing).toContain("MS_CLIENT_ID");
    expect(status.safetyRules.join(" ")).toContain("selected-file");
  });

  it("requires account auth after Microsoft app setup", () => {
    const status = getOneDriveConnectorStatus({ MS_CLIENT_ID: "client-id" });

    expect(status.state).toBe("needs_account");
    expect(status.missing).toContain("Microsoft account token");
  });

  it("requires selected-file adapter after account auth", () => {
    const status = getOneDriveConnectorStatus({
      MS_CLIENT_ID: "client-id",
      MS_TOKEN_JSON: "{}",
    });

    expect(status.state).toBe("needs_adapter");
    expect(status.missing).toContain("selected-file OneDrive adapter");
  });

  it("formats a WhatsApp-safe status without claiming broad file access", () => {
    const reply = formatOneDriveConnectorStatusForWhatsApp(getOneDriveConnectorStatus({}));

    expect(reply).toContain("OneDrive connector");
    expect(reply).toContain("Status: needs setup");
    expect(reply).toContain("Works now:");
    expect(reply).toContain("setup request queue");
    expect(reply).toContain("Safety:");
    expect(reply).toContain("Use selected-file access");
    expect(reply).not.toContain("broad OneDrive search is ready");
  });
});
