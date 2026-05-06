import { NextResponse } from "next/server";
import { evaluateSaleReadiness } from "../../../lib/sale-readiness";
import { requireSameOrigin } from "../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request): Promise<Response> {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  return NextResponse.json(evaluateSaleReadiness(), { headers: NO_STORE });
}
