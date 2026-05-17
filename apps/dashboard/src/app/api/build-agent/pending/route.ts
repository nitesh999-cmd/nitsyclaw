import { NextResponse } from "next/server";
import { listPendingFeatureRequests, getDb } from "@nitsyclaw/shared/db";
import { requireBuildAgentAuth } from "../../../../lib/build-agent-auth";
import { logDashboardError, publicConfigErrorOrNull } from "../../../../lib/dashboard-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const authError = requireBuildAgentAuth(request);
  if (authError) return authError;

  try {
    const rows = await listPendingFeatureRequests(getDb());
    return NextResponse.json({ rows }, { headers: NO_STORE });
  } catch (e) {
    const configError = publicConfigErrorOrNull(e);
    if (configError) {
      return NextResponse.json({ error: configError.reply }, { status: configError.status, headers: NO_STORE });
    }
    logDashboardError("build-agent.pending", e);
    return NextResponse.json({ error: "Failed to query pending requests" }, { status: 500, headers: NO_STORE });
  }
}
