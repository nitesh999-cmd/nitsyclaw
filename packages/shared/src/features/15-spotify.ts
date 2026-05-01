// Feature 15: Spotify read + confirmation-gated playlist creation.

import { z } from "zod";
import { insertConfirmation } from "../db/repo.js";
import { hashPhone } from "../utils/crypto.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import {
  getTopSpotifyTracks,
  searchSpotifyTracks,
  type SpotifyTrackSummary,
} from "../integrations/spotify.js";

function formatTrack(track: SpotifyTrackSummary) {
  return {
    name: track.name,
    artists: track.artists,
    album: track.album,
    uri: track.uri,
    url: track.url,
  };
}

export function registerSpotify(registry: ToolRegistry): void {
  registry.register({
    name: "spotify_top_tracks",
    description:
      "Read Nitesh's connected Spotify top tracks. Use for music taste, playlist inspiration, and listening summaries.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).optional(),
      timeRange: z.enum(["short_term", "medium_term", "long_term"]).optional(),
    }),
    handler: async (
      input: { limit?: number; timeRange?: "short_term" | "medium_term" | "long_term" },
      ctx: ToolContext,
    ) => {
      const tracks = await getTopSpotifyTracks(ctx.deps.db, hashPhone(ctx.userPhone), input);
      return { count: tracks.length, tracks: tracks.map(formatTrack) };
    },
  });

  registry.register({
    name: "spotify_search_tracks",
    description: "Search Spotify tracks by query and return track URIs for playlist drafting.",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    handler: async (input: { query: string; limit?: number }, ctx: ToolContext) => {
      const tracks = await searchSpotifyTracks(ctx.deps.db, hashPhone(ctx.userPhone), input);
      return { count: tracks.length, tracks: tracks.map(formatTrack) };
    },
  });

  registry.register({
    name: "queue_spotify_playlist_creation",
    description:
      "Queue creation of a private Spotify playlist from track URIs. This does not create the playlist until Nitesh confirms yes.",
    inputSchema: z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      uris: z.array(z.string()).min(1).max(100),
    }),
    handler: async (
      input: { name: string; description?: string; uris: string[] },
      ctx: ToolContext,
    ) => {
      const cleanUris = Array.from(
        new Set(input.uris.filter((uri) => uri.startsWith("spotify:track:"))),
      ).slice(0, 100);
      if (!cleanUris.length) {
        return { queued: false, error: "No valid Spotify track URIs provided." };
      }

      const expiresAt = new Date(ctx.now.getTime() + 15 * 60 * 1000);
      const row = await insertConfirmation(
        ctx.deps.db,
        "spotify_create_playlist",
        {
          name: input.name,
          description: input.description,
          uris: cleanUris,
          ownerHash: hashPhone(ctx.userPhone),
        },
        expiresAt,
      );
      return {
        queued: true,
        confirmationId: row.id,
        action: "spotify_create_playlist",
        name: input.name,
        trackCount: cleanUris.length,
        expiresAt: expiresAt.toISOString(),
        instruction: "Reply yes to create this private Spotify playlist, or no to cancel.",
      };
    },
  });
}
