import { NextResponse } from "next/server";
import { loadDashboardProviderHealth } from "../../../../lib/provider-health";
import { logDashboardError } from "../../../../lib/dashboard-runtime";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  try {
    const providerHealth = await loadDashboardProviderHealth();
    return NextResponse.json(providerHealth, { headers: NO_STORE });
  } catch (error) {
    logDashboardError("integrations.health", error);
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      error: "Integration health is unavailable. Try again shortly.",
    }, { status: 500, headers: NO_STORE });
  }
}
