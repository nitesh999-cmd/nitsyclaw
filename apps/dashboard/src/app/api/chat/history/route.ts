// GET /api/chat/history — returns the last N messages across BOTH surfaces
// (whatsapp + dashboard) so the /chat page can rehydrate on mount.

import { NextResponse } from "next/server";
import { getDb } from "@nitsyclaw/shared/db";
import { loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import { hashPhone } from "@nitsyclaw/shared/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);

  try {
    const db = getDb();
    const ownerPhone = process.env.WHATSAPP_OWNER_NUMBER ?? "61430008008";
    const ownerHash = hashPhone(ownerPhone);
    const history = await loadCrossSurfaceHistory(db, ownerHash, limit);
    return NextResponse.json({ messages: history });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ messages: [], error: msg }, { status: 500 });
  }
}
