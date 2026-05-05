import type { DB } from "../db/client.js";
import { deleteConnectedAccount, getConnectedAccount, upsertConnectedAccount } from "../db/repo.js";
import { decryptString, encryptString } from "../utils/crypto.js";

const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_REVOCATION_URL = "https://accounts.spotify.com/oauth2/revoke/v1";
export const SPOTIFY_SCOPES = [
  "user-top-read",
  "user-read-recently-played",
  "playlist-read-private",
  "playlist-modify-private",
].join(" ");

export interface SpotifyTrackSummary {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album?: string;
  url?: string;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface SpotifyArtist {
  name?: string;
}

interface SpotifyTrack {
  id?: string;
  uri?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: { name?: string };
  external_urls?: { spotify?: string };
}

interface SpotifyProfile {
  id: string;
  display_name?: string;
  uri?: string;
  external_urls?: { spotify?: string };
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  external_urls?: { spotify?: string };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function basicAuth(): string {
  const id = requiredEnv("SPOTIFY_CLIENT_ID");
  const secret = requiredEnv("SPOTIFY_CLIENT_SECRET");
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

function enc(value: string): string {
  return encryptString(value);
}

function dec(value: string): string {
  return decryptString(value);
}

export function buildSpotifyAuthorizeUrl(state: string): string {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requiredEnv("SPOTIFY_CLIENT_ID"));
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  url.searchParams.set("redirect_uri", requiredEnv("SPOTIFY_REDIRECT_URI"));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeSpotifyCode(code: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: requiredEnv("SPOTIFY_REDIRECT_URI"),
  });
  const resp = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) throw new Error(`Spotify token exchange failed: ${resp.status} ${await resp.text()}`);
  return (await resp.json()) as SpotifyTokenResponse;
}

async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const resp = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) throw new Error(`Spotify refresh failed: ${resp.status} ${await resp.text()}`);
  return (await resp.json()) as SpotifyTokenResponse;
}

export async function saveSpotifyConnection(args: {
  db: DB;
  ownerHash: string;
  token: SpotifyTokenResponse;
  metadata?: Record<string, unknown>;
}) {
  const expiresAt = new Date(Date.now() + Math.max(60, args.token.expires_in - 60) * 1000);
  const existing = await getConnectedAccount(args.db, {
    provider: "spotify",
    ownerHash: args.ownerHash,
    accountLabel: "default",
  });
  const refreshToken = args.token.refresh_token
    ? enc(args.token.refresh_token)
    : existing?.refreshToken ?? null;
  return upsertConnectedAccount(args.db, {
    provider: "spotify",
    ownerHash: args.ownerHash,
    accountLabel: "default",
    accessToken: enc(args.token.access_token),
    refreshToken,
    scope: args.token.scope ?? SPOTIFY_SCOPES,
    expiresAt,
    metadata: args.metadata ?? {},
  });
}

async function accessToken(db: DB, ownerHash: string): Promise<string> {
  const account = await getConnectedAccount(db, {
    provider: "spotify",
    ownerHash,
    accountLabel: "default",
  });
  if (!account) {
    throw new Error("Spotify is not connected. Open /api/integrations/spotify/connect first.");
  }

  if (!account.expiresAt || account.expiresAt.getTime() > Date.now() + 60_000) {
    return dec(account.accessToken);
  }

  if (!account.refreshToken) {
    throw new Error("Spotify token expired and no refresh token is stored. Reconnect Spotify.");
  }

  const refreshed = await refreshSpotifyToken(dec(account.refreshToken));
  await saveSpotifyConnection({
    db,
    ownerHash,
    token: {
      ...refreshed,
      refresh_token: refreshed.refresh_token ?? dec(account.refreshToken),
    },
    metadata: account.metadata ?? {},
  });
  return refreshed.access_token;
}

async function spotifyFetch<T>(
  db: DB,
  ownerHash: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await accessToken(db, ownerHash);
  const resp = await fetch(`${SPOTIFY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!resp.ok) throw new Error(`Spotify ${path} failed: ${resp.status} ${await resp.text()}`);
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

function summarizeTrack(track: SpotifyTrack): SpotifyTrackSummary {
  return {
    id: track.id ?? "",
    uri: track.uri ?? "",
    name: track.name ?? "(unknown)",
    artists: (track.artists ?? []).map((artist) => artist.name).filter((name): name is string => Boolean(name)),
    album: track.album?.name,
    url: track.external_urls?.spotify,
  };
}

export async function getSpotifyProfile(db: DB, ownerHash: string) {
  return spotifyFetch<SpotifyProfile>(db, ownerHash, "/me");
}

export async function getTopSpotifyTracks(
  db: DB,
  ownerHash: string,
  args: { limit?: number; timeRange?: "short_term" | "medium_term" | "long_term" } = {},
) {
  const params = new URLSearchParams({
    limit: String(args.limit ?? 10),
    time_range: args.timeRange ?? "medium_term",
  });
  const data = await spotifyFetch<{ items?: SpotifyTrack[] }>(
    db,
    ownerHash,
    `/me/top/tracks?${params.toString()}`,
  );
  return (data.items ?? []).map(summarizeTrack);
}

export async function searchSpotifyTracks(
  db: DB,
  ownerHash: string,
  args: { query: string; limit?: number },
) {
  const params = new URLSearchParams({
    q: args.query,
    type: "track",
    limit: String(args.limit ?? 10),
  });
  const data = await spotifyFetch<{ tracks?: { items?: SpotifyTrack[] } }>(
    db,
    ownerHash,
    `/search?${params.toString()}`,
  );
  return (data.tracks?.items ?? []).map(summarizeTrack);
}

export async function createPrivateSpotifyPlaylist(
  db: DB,
  ownerHash: string,
  args: { name: string; description?: string; uris: string[] },
) {
  const me = await getSpotifyProfile(db, ownerHash);
  const playlist = await spotifyFetch<SpotifyPlaylist>(db, ownerHash, `/users/${encodeURIComponent(me.id)}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name: args.name,
      public: false,
      description: args.description ?? "Created by NitsyClaw",
    }),
  });
  const uris = args.uris.filter((uri) => uri.startsWith("spotify:track:")).slice(0, 100);
  if (uris.length) {
    await spotifyFetch(db, ownerHash, `/playlists/${encodeURIComponent(playlist.id)}/items`, {
      method: "POST",
      body: JSON.stringify({ uris }),
    });
  }
  return {
    id: playlist.id,
    name: playlist.name,
    url: playlist.external_urls?.spotify,
    added: uris.length,
  };
}

export async function disconnectSpotify(
  db: DB,
  ownerHash: string,
): Promise<{ existed: boolean; revoked: boolean; revokeError?: string }> {
  const account = await getConnectedAccount(db, {
    provider: "spotify",
    ownerHash,
    accountLabel: "default",
  });
  if (!account) return { existed: false, revoked: false };

  let revoked = false;
  let revokeError: string | undefined;
  for (const encryptedToken of [account.accessToken, account.refreshToken].filter((token): token is string => Boolean(token))) {
    try {
      await revokeSpotifyToken(dec(encryptedToken));
      revoked = true;
    } catch (error) {
      revokeError = error instanceof Error ? error.message : "Spotify token revoke failed";
    }
  }

  if (revokeError) {
    return { existed: true, revoked, revokeError };
  }

  await deleteConnectedAccount(db, {
    provider: "spotify",
    ownerHash,
    accountLabel: "default",
  });
  return { existed: true, revoked, revokeError };
}

async function revokeSpotifyToken(token: string): Promise<void> {
  const body = new URLSearchParams({ token });
  const resp = await fetch(SPOTIFY_REVOCATION_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Spotify revoke failed: ${resp.status}`);
  }
}
