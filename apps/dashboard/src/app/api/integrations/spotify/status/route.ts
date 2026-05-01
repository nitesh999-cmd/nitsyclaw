import { NextResponse } from "next/server";
import { getDb, getConnectedAccount } from "@nitsyclaw/shared/db";
import { hashPhone } from "@nitsyclaw/shared/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured() {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.SPOTIFY_REDIRECT_URI,
  );
}

export async function GET() {
  if (!configured()) {
    return NextResponse.json({
      provider: "spotify",
      configured: false,
      connected: false,
      status: "needs_server_env",
    });
  }

  const db = getDb();
  const ownerPhone = process.env.WHATSAPP_OWNER_NUMBER ?? "61430008008";
  const account = await getConnectedAccount(db, {
    provider: "spotify",
    ownerHash: hashPhone(ownerPhone),
  });

  return NextResponse.json({
    provider: "spotify",
    configured: true,
    connected: Boolean(account),
    status: account ? "connected" : "needs_connection",
    expiresAt: account?.expiresAt?.toISOString() ?? null,
    scope: account?.scope ?? null,
    profile: account?.metadata ?? null,
  });
}
