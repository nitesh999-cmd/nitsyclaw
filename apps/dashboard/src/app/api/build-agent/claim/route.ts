import { NextResponse } from "next/server";
import { setFeatureRequestStatus, getDb } from "@nitsyclaw/shared/db";
import { requireBuildAgentAuth } from "../../../../lib/build-agent-auth";
import { logDashboardError, publicConfigErrorOrNull } from "../../../../lib/dashboard-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ClaimBody {
  id?: string;
}

export async function POST(request: Request): Promise<Response> {
  const authError = requireBuildAgentAuth(request);
  if (authError) return authError;

  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid feature request id" }, { status: 400, headers: NO_STORE });
  }

  try {
    const claimed = await setFeatureRequestStatus(getDb(), id, {
      status: "in_progress",
      expectedStatus: "pending",
    });
    return NextResponse.json({ claimed }, { headers: NO_STORE });
  } catch (e) {
    const configError = publicConfigErrorOrNull(e);
    if (configError) {
      return NextResponse.json({ error: configError.reply }, { status: configError.status, headers: NO_STORE });
    }
    logDashboardError("build-agent.claim", e);
    return NextResponse.json({ error: "Failed to claim request" }, { status: 500, headers: NO_STORE });
  }
}
