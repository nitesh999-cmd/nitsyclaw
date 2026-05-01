import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertConfirmation } from "../src/db/repo.js";
import { registerAllFeatures } from "../src/features/index.js";
import {
  buildSpotifyAuthorizeUrl,
  createPrivateSpotifyPlaylist,
  saveSpotifyConnection,
} from "../src/integrations/spotify.js";
import { hashPhone } from "../src/utils/crypto.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";

const key = Buffer.alloc(32, 9).toString("base64");

describe("spotify integration", () => {
  const oldEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      ENCRYPTION_KEY: key,
      SPOTIFY_CLIENT_ID: "client-id",
      SPOTIFY_CLIENT_SECRET: "client-secret",
      SPOTIFY_REDIRECT_URI: "http://localhost/callback",
    };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = oldEnv;
    vi.restoreAllMocks();
  });

  it("registers Spotify tools", () => {
    const names = registerAllFeatures({ surface: "whatsapp" }).all().map((tool) => tool.name);
    expect(names).toContain("spotify_top_tracks");
    expect(names).toContain("spotify_search_tracks");
    expect(names).toContain("queue_spotify_playlist_creation");
  });

  it("builds an OAuth authorize URL with configured scopes and state", () => {
    const url = new URL(buildSpotifyAuthorizeUrl("state-123"));
    expect(url.hostname).toBe("accounts.spotify.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toContain("user-top-read");
    expect(url.searchParams.get("scope")).toContain("playlist-modify-private");
  });

  it("creates a private playlist and filters invalid track URIs", async () => {
    const { db } = makeFakeDb();
    const ownerHash = hashPhone("+61430008008");
    await saveSpotifyConnection({
      db: db as any,
      ownerHash,
      token: {
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh",
        scope: "playlist-modify-private",
      },
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/me")) {
        return Response.json({ id: "spotify-user" });
      }
      if (url.endsWith("/users/spotify-user/playlists")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body)).public).toBe(false);
        return Response.json({
          id: "playlist-1",
          name: "Nitsy Mix",
          external_urls: { spotify: "https://open.spotify.com/playlist/playlist-1" },
        }, { status: 201 });
      }
      if (url.endsWith("/playlists/playlist-1/items")) {
        const body = JSON.parse(String(init?.body));
        expect(body.uris).toEqual(["spotify:track:1"]);
        return Response.json({ snapshot_id: "snap" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await createPrivateSpotifyPlaylist(db as any, ownerHash, {
      name: "Nitsy Mix",
      uris: ["spotify:track:1", "bad:track:2"],
    });

    expect(out.added).toBe(1);
    expect(out.url).toContain("playlist-1");
  });

  it("confirmation tool executes spotify playlist creation after yes", async () => {
    const deps = makeAgentDeps({ db: makeFakeDb().db as any });
    const ownerHash = hashPhone("+61430008008");
    await saveSpotifyConnection({
      db: deps.db as any,
      ownerHash,
      token: {
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh",
      },
    });
    await insertConfirmation(
      deps.db as any,
      "spotify_create_playlist",
      { ownerHash, name: "Approved Mix", uris: ["spotify:track:1"] },
      new Date("2026-04-25T09:00:00Z"),
    );

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/me")) return Response.json({ id: "spotify-user" });
      if (url.endsWith("/users/spotify-user/playlists")) {
        return Response.json({ id: "playlist-1", name: "Approved Mix", external_urls: { spotify: "https://x" } }, { status: 201 });
      }
      if (url.endsWith("/playlists/playlist-1/items")) return Response.json({ snapshot_id: "snap" });
      throw new Error(`unexpected fetch ${url}`);
    }));

    const tool = registerAllFeatures({ surface: "whatsapp" }).get("resolve_confirmation")!;
    const out: any = await tool.handler(
      { reply: "yes" },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );

    expect(out.resolved).toBe(true);
    expect(out.playlist.id).toBe("playlist-1");
  });
});
