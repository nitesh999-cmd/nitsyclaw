import { describe, expect, it } from "vitest";
import {
  dashboardStatus,
  formatProviderHealthReport,
  getProviderSetupReadiness,
  summarizeProviderSetupReadiness,
} from "./provider-setup-readiness";

describe("dashboard provider setup readiness", () => {
  it("reports missing setup without exposing secret values or claiming live access", () => {
    const readiness = getProviderSetupReadiness({});
    const gmail = readiness.find((item) => item.key === "gmail");
    const bankFeeds = readiness.find((item) => item.key === "bank-feeds");

    expect(gmail?.status).toBe("needs_setup");
    expect(gmail?.missing).toContain("GOOGLE_CREDENTIALS_JSON");
    expect(gmail?.summary).not.toContain("connected");
    expect(gmail?.configured).toEqual([]);
    expect(bankFeeds?.status).toBe("blocked");
    expect(bankFeeds?.missing).toContain("Compliant bank-data provider");
    expect(bankFeeds?.healthChecks.some((check) => check.name === "Consent gate" && check.status === "fail")).toBe(true);
    expect(dashboardStatus("blocked")).toBe("Blocked");
  });

  it("distinguishes configured OAuth apps from connected user accounts", () => {
    const readiness = getProviderSetupReadiness({
      GOOGLE_CREDENTIALS_JSON: "secret-json",
      MS_CLIENT_ID: "client-id",
      SPOTIFY_CLIENT_ID: "spotify-id",
      SPOTIFY_CLIENT_SECRET: "spotify-secret",
      SPOTIFY_REDIRECT_URI: "https://example.test/callback",
    });

    const gmail = readiness.find((item) => item.key === "gmail");
    const outlook = readiness.find((item) => item.key === "outlook");
    const spotify = readiness.find((item) => item.key === "spotify");

    expect(gmail?.status).toBe("needs_account");
    expect(gmail?.configured).toContain("Google OAuth app");
    expect(gmail?.missing).toContain("Google account token");
    expect(outlook?.status).toBe("needs_account");
    expect(spotify?.status).toBe("needs_account");
    expect(spotify?.missing).toContain("Spotify account token");
  });

  it("marks account tokens as partial and keeps risky actions confirmation-gated", () => {
    const readiness = getProviderSetupReadiness({
      GOOGLE_TOKEN_JSON_PERSONAL: "secret-json",
      MS_TOKEN_JSON: "secret-json",
      SPOTIFY_CLIENT_ID: "spotify-id",
      SPOTIFY_CLIENT_SECRET: "spotify-secret",
      SPOTIFY_REDIRECT_URI: "https://example.test/callback",
    }, {
      spotifyConnected: true,
    });

    const gmail = readiness.find((item) => item.key === "gmail");
    const outlook = readiness.find((item) => item.key === "outlook");
    const spotify = readiness.find((item) => item.key === "spotify");
    const phone = readiness.find((item) => item.key === "phone-sms");

    expect(gmail?.status).toBe("partial");
    expect(gmail?.safety).toContain("confirmation");
    expect(outlook?.status).toBe("partial");
    expect(spotify?.status).toBe("partial");
    expect(phone?.status).toBe("approval_required");
    expect(phone?.safety).toContain("Wrong-recipient");
  });

  it("flags expired Spotify tokens without a refresh token as needing account repair", () => {
    const readiness = getProviderSetupReadiness({
      SPOTIFY_CLIENT_ID: "spotify-id",
      SPOTIFY_CLIENT_SECRET: "spotify-secret",
      SPOTIFY_REDIRECT_URI: "https://example.test/callback",
    }, {
      spotifyConnected: true,
      spotifyExpiresAt: new Date("2000-01-01T00:00:00Z"),
      spotifyHasRefreshToken: false,
    });

    const spotify = readiness.find((item) => item.key === "spotify");

    expect(spotify?.status).toBe("needs_account");
    expect(spotify?.summary).toContain("expired");
    expect(spotify?.missing).toContain("Fresh Spotify account token or refresh token");
    expect(spotify?.nextStep).toContain("Reconnect Spotify");
  });

  it("summarises provider health for dashboard/API surfaces", () => {
    const readiness = getProviderSetupReadiness({
      GOOGLE_TOKEN_JSON_PERSONAL: "secret-json",
      DATABASE_URL: "postgres://example.invalid/redacted",
    });
    const summary = summarizeProviderSetupReadiness(readiness);
    const report = formatProviderHealthReport(readiness);

    expect(summary.total).toBe(readiness.length);
    expect(summary.readyOrPartial).toBeGreaterThan(0);
    expect(summary.blockedLabels).toContain("Bank feeds");
    expect(summary.launchBlockers.some((item) => item.includes("Google Drive"))).toBe(true);
    expect(report).toContain("Provider health");
    expect(report).toContain("Ready/partly ready:");
    expect(report).toContain("Bank feeds: blocked");
    expect(report).not.toContain("postgres://");
  });
});
