import { NextResponse } from "next/server";
import { getDb } from "@nitsyclaw/shared/db";
import { getOwnerIdentity, logDashboardError, publicConfigErrorOrNull } from "../../../../../lib/dashboard-runtime";
import {
  exchangeSpotifyCode,
  getSpotifyProfile,
  saveSpotifyConnection,
} from "@nitsyclaw/shared/integrations/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("spotify_oauth_state="))
    ?.slice("spotify_oauth_state=".length);

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400, headers: NO_STORE });
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json(
      { ok: false, error: "Invalid Spotify OAuth state." },
      { status: 400, headers: NO_STORE },
    );
  }

  let db;
  let ownerHash: string;
  try {
    db = getDb();
    ({ ownerHash } = getOwnerIdentity());
  } catch (e) {
    const configError = publicConfigErrorOrNull(e) ?? { reply: "Dashboard configuration is incomplete.", status: 503 };
    return NextResponse.json(
      { ok: false, error: configError.reply },
      { status: configError.status, headers: NO_STORE },
    );
  }

  let token: Awaited<ReturnType<typeof exchangeSpotifyCode>>;
  try {
    token = await exchangeSpotifyCode(code);
    await saveSpotifyConnection({ db, ownerHash, token, metadata: { connectedAt: new Date().toISOString() } });
  } catch (e) {
    logDashboardError("spotify.callback", e);
    return NextResponse.json(
      { ok: false, error: "Spotify connection failed. Try connecting again." },
      { status: 502, headers: NO_STORE },
    );
  }

  let profile: Record<string, unknown> = {};
  try {
    const me = await getSpotifyProfile(db, ownerHash);
    profile = {
      id: me.id,
      displayName: me.display_name,
      uri: me.uri,
      url: me.external_urls?.spotify,
    };
    await saveSpotifyConnection({ db, ownerHash, token, metadata: { ...profile, connectedAt: new Date().toISOString() } });
  } catch {
    // Token is saved; profile can be refreshed later.
  }

  const res = NextResponse.json({ ok: true, provider: "spotify", profile });
  res.cookies.delete("spotify_oauth_state");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
