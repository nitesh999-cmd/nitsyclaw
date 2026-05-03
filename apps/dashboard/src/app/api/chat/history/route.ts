// GET /api/chat/history — returns the last N messages across BOTH surfaces
// (whatsapp + dashboard) so the /chat page can rehydrate on mount.

import { NextResponse } from "next/server";
import { getDb } from "@nitsyclaw/shared/db";
import { loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import { getOwnerIdentity, publicConfigError } from "../../../../lib/dashboard-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 100);

  try {
    const db = getDb();
    const { ownerHash } = getOwnerIdentity();
    const history = await loadCrossSurfaceHistory(db, ownerHash, limit);
    return NextResponse.json({ messages: history });
  } catch (e: unknown) {
    const configError = publicConfigError(e);
    if (configError.status === 503) {
      return NextResponse.json({ messages: [], error: configError.reply }, { status: configError.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ messages: [], error: msg }, { status: 500 });
  }
}
