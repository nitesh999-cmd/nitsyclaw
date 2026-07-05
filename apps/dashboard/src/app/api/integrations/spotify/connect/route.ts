import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildSpotifyAuthorizeUrl } from "@nitsyclaw/shared/integrations/spotify";
import { requireDashboardSession } from "../../../../../lib/require-dashboard-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function missingEnv(): string[] {
  return ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"].filter(
    (key) => !process.env[key],
  );
}

// NOTE: no requireSameOrigin here — this endpoint is meant to be reached via
// a top-level browser navigation (clicking "Connect Spotify"), which often
// carries no Origin header at all. requireDashboardSession is the real gate:
// without it, anyone who could reach this URL could link THEIR OWN Spotify
// account to Nitesh's dashboard session (see mind.md finding — Spotify
// connect/callback had no auth at all).
export async function GET(req: Request) {
  const sessionError = await requireDashboardSession(req);
  if (sessionError) return sessionError;

  const missing = missingEnv();
  if (missing.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Spotify is not configured on the server.",
        missing,
      },
      { status: 503, headers: NO_STORE },
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
  res.headers.set("Cache-Control", "no-store");
  return res;
}
