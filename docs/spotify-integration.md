# Spotify integration

Implemented:

- `/api/integrations/spotify/connect`
- `/api/integrations/spotify/callback`
- `/api/integrations/spotify/status`
- `/integrations` dashboard visibility
- `spotify_top_tracks`
- `spotify_search_tracks`
- `queue_spotify_playlist_creation`

Required env:

```env
SPOTIFY_CLIENT_ID=""
SPOTIFY_CLIENT_SECRET=""
SPOTIFY_REDIRECT_URI="http://localhost:3000/api/integrations/spotify/callback"
```

Production redirect URI:

```env
https://nitsyclaw.vercel.app/api/integrations/spotify/callback
```

Current scopes:

- `user-top-read`
- `user-read-recently-played`
- `playlist-read-private`
- `playlist-modify-private`

Safety:

- Read tools do not modify Spotify.
- Playlist creation queues a confirmation.
- Nitesh must reply `yes` before a private playlist is created.
- Tokens are encrypted at rest with `ENCRYPTION_KEY`.
