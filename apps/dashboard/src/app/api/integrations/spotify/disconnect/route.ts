import { NextResponse } from "next/server";
import { disconnectSpotify } from "@nitsyclaw/shared/integrations/spotify";
import { getDb } from "@nitsyclaw/shared/db";
import { getOwnerIdentity, publicConfigErrorOrNull } from "../../../../../lib/dashboard-runtime";
import { requireSameOrigin } from "../../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request): Promise<Response> {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  try {
    const { ownerHash } = getOwnerIdentity();
    const result = await disconnectSpotify(getDb(), ownerHash);
    const url = new URL("/integrations", req.url);
    url.searchParams.set("spotify", result.revokeError ? "revoke-failed" : result.existed ? "disconnected" : "not-connected");
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    const configError = publicConfigErrorOrNull(e);
    if (configError) {
      return NextResponse.json({ reply: configError.reply }, { status: configError.status, headers: NO_STORE });
    }
    console.error("[spotify/disconnect] failed", e);
    return NextResponse.json({ reply: "Spotify disconnect failed." }, { status: 500, headers: NO_STORE });
  }
}
