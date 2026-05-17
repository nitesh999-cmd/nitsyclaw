import { describe, expect, it } from "vitest";

import {
  formatOfflineOperatorRunReport,
  formatOperatorQueueDoctorReport,
  formatOperatorRunnerError,
} from "./operator-runner.js";

describe("operator runner error safety", () => {
  it("keeps the safe DATABASE_URL guidance", () => {
    const message = formatOperatorRunnerError(new Error("DATABASE_URL is not configured"));

    expect(message).toContain("Operator runner cannot read queued work");
    expect(message).toContain("No queue state was changed.");
  });

  it("redacts secrets and contact data from unexpected failures", () => {
    const message = formatOperatorRunnerError(
      new Error(
        "claim failed postgres://user:pass@example.test/db for nitesh@example.com +61 430 008 008 sk_live_secret123456",
      ),
    );

    expect(message).toContain("[redacted:database-url]");
    expect(message).toContain("[redacted:email]");
    expect(message).toContain("[redacted:phone]");
    expect(message).toContain("[redacted:token]");
    expect(message).not.toContain("postgres://");
    expect(message).not.toContain("nitesh@example.com");
    expect(message).not.toContain("+61 430 008 008");
    expect(message).not.toContain("sk_live");
  });

  it("gives an honest offline dry-run plan when the live queue is unavailable", () => {
    const message = formatOfflineOperatorRunReport();

    expect(message).toContain("operator-queue=unavailable");
    expect(message).toContain("mode=offline-safe-dry-run");
    expect(message).toContain("No queue state was changed.");
    expect(message).toContain("pnpm lint");
    expect(message).toContain("pnpm typecheck");
    expect(message).toContain("pnpm test");
    expect(message).toContain("pnpm build");
    expect(message).toContain("WhatsApp queued-integration routing");
    expect(message).toContain("Gmail/Outlook");
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("pnpm operator:doctor");
  });

  it("reports queue access and provider setup signals without exposing secrets", () => {
    const message = formatOperatorQueueDoctorReport({
      DATABASE_URL: undefined,
      RAILWAY_TOKEN: "railway-secret",
      GOOGLE_CREDENTIALS_JSON: "google-secret",
      MS_CLIENT_ID: undefined,
      SPOTIFY_CLIENT_ID: "spotify-id",
      SPOTIFY_CLIENT_SECRET: "spotify-secret",
      SPOTIFY_REDIRECT_URI: "https://example.test/callback",
    });

    expect(message).toContain("operator-queue-doctor");
    expect(message).toContain("live_queue_access=missing_DATABASE_URL");
    expect(message).toContain("railway_cli_token=configured");
    expect(message).toContain("some Google credential/token present");
    expect(message).toContain("needs Microsoft app/token");
    expect(message).toContain("OAuth app configured");
    expect(message).toContain("pnpm operator:next");
    expect(message).not.toContain("railway-secret");
    expect(message).not.toContain("google-secret");
    expect(message).not.toContain("spotify-secret");
  });
});
