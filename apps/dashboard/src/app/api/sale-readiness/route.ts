import { NextResponse } from "next/server";
import { evaluateSaleReadiness } from "../../../lib/sale-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  return NextResponse.json(evaluateSaleReadiness(), { headers: NO_STORE });
}
