import { NextResponse } from "next/server";
import { setFeatureRequestStatus, insertMessage, getDb } from "@nitsyclaw/shared/db";
import { requireBuildAgentAuth } from "../../../../lib/build-agent-auth";
import { logDashboardError, publicConfigErrorOrNull } from "../../../../lib/dashboard-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CompleteBody {
  id?: string;
  status?: "done" | "rejected";
  implementationNotes?: string;
  prUrl?: string;
  rejectionReason?: string;
  ownerHash?: string;
  notificationBody?: string;
  surface?: "whatsapp" | "dashboard";
}

export async function POST(request: Request): Promise<Response> {
  const authError = requireBuildAgentAuth(request);
  if (authError) return authError;

  let body: CompleteBody;
  try {
    body = (await request.json()) as CompleteBody;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid feature request id" }, { status: 400, headers: NO_STORE });
  }

  const status = body.status;
  if (status !== "done" && status !== "rejected") {
    return NextResponse.json({ error: "status must be done or rejected" }, { status: 400, headers: NO_STORE });
  }

  const db = getDb();

  try {
    const updated = await setFeatureRequestStatus(db, id, {
      status,
      expectedStatus: "in_progress",
      implementationNotes: body.implementationNotes,
      prUrl: body.prUrl,
      rejectionReason: body.rejectionReason,
      completedAt: new Date(),
    });

    if (!updated) {
      return NextResponse.json({ error: "Feature request not found or not in_progress" }, { status: 404, headers: NO_STORE });
    }

    if (body.ownerHash && body.notificationBody) {
      const surface = body.surface ?? "dashboard";
      await insertMessage(db, {
        direction: "out",
        surface,
        fromNumber: body.ownerHash,
        body: body.notificationBody.slice(0, 4000),
      });
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    const configError = publicConfigErrorOrNull(e);
    if (configError) {
      return NextResponse.json({ error: configError.reply }, { status: configError.status, headers: NO_STORE });
    }
    logDashboardError("build-agent.complete", e);
    return NextResponse.json({ error: "Failed to complete request" }, { status: 500, headers: NO_STORE });
  }
}
