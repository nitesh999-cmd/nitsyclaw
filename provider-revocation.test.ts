import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("provider revocation", () => {
  test("Spotify disconnect revokes provider tokens before deleting the local account", () => {
    const integration = readFileSync("packages/shared/src/integrations/spotify.ts", "utf8");
    const route = readFileSync("apps/dashboard/src/app/api/integrations/spotify/disconnect/route.ts", "utf8");
    const page = readFileSync("apps/dashboard/src/app/integrations/page.tsx", "utf8");

    expect(integration).toContain("SPOTIFY_REVOCATION_URL");
    expect(integration).toContain("disconnectSpotify");
    expect(integration).toContain("revokeSpotifyToken");
    expect(integration).toContain("deleteConnectedAccount");
    expect(integration).toContain("if (revokeError)");
    expect(route).toContain("requireSameOrigin");
    expect(route).toContain("disconnectSpotify");
    expect(route).toContain("revoke-failed");
    expect(route).toContain("Cache-Control");
    expect(route).toContain("no-store");
    expect(page).toContain("/api/integrations/spotify/disconnect");
    expect(page).toContain("Disconnect Spotify");
    expect(page).toContain("Spotify disconnect failed at the provider");
  });
});
