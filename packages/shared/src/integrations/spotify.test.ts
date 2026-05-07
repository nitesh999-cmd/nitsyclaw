import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeSpotifyCode, formatSpotifyHttpError } from "./spotify.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("Spotify integration error safety", () => {
  it("does not include Spotify token response bodies in exchange errors", async () => {
    process.env.SPOTIFY_CLIENT_ID = "client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "client-secret";
    process.env.SPOTIFY_REDIRECT_URI = "https://example.test/callback";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid_grant for nitesh@example.com access_token=secret", { status: 400 })),
    );

    await expect(exchangeSpotifyCode("bad-code")).rejects.toThrow("Spotify token exchange failed: 400");
    await expect(exchangeSpotifyCode("bad-code")).rejects.not.toThrow("nitesh@example.com");
    await expect(exchangeSpotifyCode("bad-code")).rejects.not.toThrow("access_token");
  });

  it("does not include Spotify query strings in API errors", () => {
    const message = formatSpotifyHttpError(
      "API request",
      429,
      "/search?q=Nitesh%20private%20medicine&type=track",
    );

    expect(message).toBe("Spotify API request /search failed: 429");
    expect(message).not.toContain("Nitesh");
    expect(message).not.toContain("private");
    expect(message).not.toContain("medicine");
  });
});
