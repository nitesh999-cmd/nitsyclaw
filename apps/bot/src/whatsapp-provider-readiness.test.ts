import { describe, expect, it } from "vitest";
import {
  formatProviderReadinessLine,
  getWhatsAppProviderReadiness,
} from "./whatsapp-provider-readiness.js";

describe("WhatsApp provider readiness", () => {
  it("reports missing provider setup without claiming external access is live", () => {
    const readiness = getWhatsAppProviderReadiness({});

    expect(readiness.gmail.status).toBe("needs_setup");
    expect(readiness.outlook.status).toBe("needs_setup");
    expect(readiness["bank-feeds"].status).toBe("needs_setup");
    expect(formatProviderReadinessLine(readiness.gmail)).toContain("No Google OAuth credentials");
    expect(formatProviderReadinessLine(readiness.gmail)).not.toContain("connected");
  });

  it("distinguishes configured apps from connected accounts", () => {
    const readiness = getWhatsAppProviderReadiness({
      SPOTIFY_CLIENT_ID: "client-id",
      SPOTIFY_CLIENT_SECRET: "client-secret",
      SPOTIFY_REDIRECT_URI: "https://example.test/callback",
      MS_CLIENT_ID: "client-id",
    });

    expect(readiness.spotify.status).toBe("needs_account");
    expect(readiness.outlook.status).toBe("needs_account");
    expect(formatProviderReadinessLine(readiness.spotify)).toContain("user account connection is still required");
  });

  it("treats account tokens as partial readiness, not permission to auto-send", () => {
    const readiness = getWhatsAppProviderReadiness({
      GOOGLE_TOKEN_JSON_PERSONAL: "{}",
      MS_TOKEN_JSON: "{}",
    });

    expect(readiness.gmail.status).toBe("partial");
    expect(readiness.outlook.status).toBe("partial");
    expect(formatProviderReadinessLine(readiness.gmail)).toContain("confirmation-gated");
    expect(formatProviderReadinessLine(readiness.outlook)).toContain("confirmation-gated");
  });

  it("uses runtime signals for stored Spotify account state without claiming auto-send", () => {
    const readiness = getWhatsAppProviderReadiness({}, {
      spotifyConnected: true,
      spotifyExpiresAt: new Date("2026-05-16T10:00:00Z"),
    });

    expect(readiness.spotify.status).toBe("partial");
    expect(formatProviderReadinessLine(readiness.spotify)).toContain("Spotify account token is stored");
    expect(formatProviderReadinessLine(readiness.spotify)).toContain("playlist creation still needs confirmation");
  });
});
