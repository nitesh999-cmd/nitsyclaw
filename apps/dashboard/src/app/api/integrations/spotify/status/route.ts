import { NextResponse } from "next/server";
import { getDb, getConnectedAccount } from "@nitsyclaw/shared/db";
import { getOwnerIdentity, publicConfigError } from "../../../../../lib/dashboard-runtime";

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

  let ownerHash: string;
  try {
    ({ ownerHash } = getOwnerIdentity());
  } catch (e) {
    const configError = publicConfigError(e);
    return NextResponse.json({
      provider: "spotify",
      configured: true,
      connected: false,
      status: "needs_owner_env",
      error: configError.reply,
    }, { status: configError.status });
  }

  const db = getDb();
  const account = await getConnectedAccount(db, {
    provider: "spotify",
    ownerHash,
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
