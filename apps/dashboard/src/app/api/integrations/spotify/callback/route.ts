import { NextResponse } from "next/server";
import { getDb } from "@nitsyclaw/shared/db";
import { getOwnerIdentity, publicConfigError } from "../../../../../lib/dashboard-runtime";
import {
  exchangeSpotifyCode,
  getSpotifyProfile,
  saveSpotifyConnection,
} from "@nitsyclaw/shared/integrations/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json({ ok: false, error: "Invalid Spotify OAuth state." }, { status: 400 });
  }

  let db;
  let ownerHash: string;
  try {
    db = getDb();
    ({ ownerHash } = getOwnerIdentity());
  } catch (e) {
    const configError = publicConfigError(e);
    return NextResponse.json({ ok: false, error: configError.reply }, { status: configError.status });
  }

  const token = await exchangeSpotifyCode(code);
  await saveSpotifyConnection({ db, ownerHash, token, metadata: { connectedAt: new Date().toISOString() } });

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
  return res;
}
