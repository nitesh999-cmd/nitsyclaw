import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildSpotifyAuthorizeUrl } from "@nitsyclaw/shared/integrations/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function missingEnv(): string[] {
  return ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"].filter(
    (key) => !process.env[key],
  );
}

export async function GET() {
  const missing = missingEnv();
  if (missing.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Spotify is not configured on the server.",
        missing,
      },
      { status: 503 },
    );
  }

  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(buildSpotifyAuthorizeUrl(state));
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
