import { NextResponse } from "next/server";
import { getDb, getConnectedAccount } from "@nitsyclaw/shared/db";
import { getOwnerIdentity, publicConfigErrorOrNull } from "../../../../../lib/dashboard-runtime";
import { requireSameOrigin } from "../../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function configured() {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.SPOTIFY_REDIRECT_URI,
  );
}

export async function GET(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  if (!configured()) {
    return NextResponse.json({
      provider: "spotify",
      configured: false,
      connected: false,
      status: "needs_server_env",
    }, { headers: NO_STORE });
  }

  let ownerHash: string;
  try {
    ({ ownerHash } = getOwnerIdentity());
  } catch (e) {
    const configError = publicConfigErrorOrNull(e) ?? { reply: "Dashboard configuration is incomplete.", status: 503 };
    return NextResponse.json({
      provider: "spotify",
      configured: true,
      connected: false,
      status: "needs_owner_env",
      error: configError.reply,
    }, { status: configError.status, headers: NO_STORE });
  }

  let account: Awaited<ReturnType<typeof getConnectedAccount>>;
  try {
    const db = getDb();
    account = await getConnectedAccount(db, {
      provider: "spotify",
      ownerHash,
    });
  } catch (e) {
    console.error("[spotify/status] failed", e);
    return NextResponse.json({
      provider: "spotify",
      configured: true,
      connected: false,
      status: "unavailable",
      error: "Spotify status is unavailable. Check server logs.",
    }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({
    provider: "spotify",
    configured: true,
    connected: Boolean(account),
    status: account ? "connected" : "needs_connection",
    expiresAt: account?.expiresAt?.toISOString() ?? null,
    scope: account?.scope ?? null,
    profile: account?.metadata ?? null,
  }, { headers: NO_STORE });
}
