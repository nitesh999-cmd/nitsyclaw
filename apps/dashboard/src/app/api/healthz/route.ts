import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@nitsyclaw/shared/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
