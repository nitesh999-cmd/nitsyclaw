import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  featureRequests,
  getDb,
  insertFeatureRequest,
  type FeatureRequest,
} from "@nitsyclaw/shared/db";
import {
  getOperatorMission,
  missionToQueueDescription,
  OPERATOR_MISSIONS,
  type OperatorMission,
} from "../../../command/operator-missions";
import { getOwnerIdentity, publicConfigErrorOrNull } from "../../../../lib/dashboard-runtime";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BATCH = 20;

type QueueAction = "queue_mission" | "queue_all";

interface QueueBody {
  action?: QueueAction;
  missionId?: string;
}

interface QueueResult {
  missionId: string;
  title: string;
  status: "queued" | "existing";
  featureId: string;
}

export async function POST(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  let rawBody: QueueBody;
  try {
    rawBody = (await request.json()) as QueueBody;
  } catch {
    return NextResponse.json({ reply: "Bad request" }, { status: 400 });
  }

  const action = rawBody.action;
  if (action !== "queue_mission" && action !== "queue_all") {
    return NextResponse.json({ reply: "Invalid operator job action" }, { status: 400 });
  }

  const missions =
    action === "queue_all"
      ? OPERATOR_MISSIONS.slice(0, MAX_BATCH)
      : rawBody.missionId
        ? [getOperatorMission(rawBody.missionId)].filter(Boolean)
        : [];

  if (missions.length === 0) {
    return NextResponse.json({ reply: "Unknown operator mission" }, { status: 400 });
  }

  try {
    const db = getDb();
    const { ownerHash } = getOwnerIdentity();
    const results: QueueResult[] = [];

    for (const mission of missions as OperatorMission[]) {
      const dedupeKey = `operator-mission:${mission.id}`;
      const existing = await findExistingMissionJob(db, dedupeKey);
      if (existing) {
        results.push({
          missionId: mission.id,
          title: mission.title,
          status: "existing",
          featureId: existing.id,
        });
        continue;
      }

      const row = await insertFeatureRequest(db, {
        description: missionToQueueDescription(mission),
        type: "feature",
        severity: mission.severity,
        size: mission.size,
        source: "dashboard",
        requestedBy: ownerHash,
        dedupeKey,
        implementationNotes: `Operator mission queued from /command. Category=${mission.category}. Outcome=${mission.outcome}`,
      });
      results.push({
        missionId: mission.id,
        title: mission.title,
        status: "queued",
        featureId: row.id,
      });
    }

    const queued = results.filter((result) => result.status === "queued").length;
    const existing = results.length - queued;
    return NextResponse.json({
      reply: `Operator jobs ready. Queued ${queued}; already existed ${existing}.`,
      queued,
      existing,
      results,
    });
  } catch (e) {
    const configError = publicConfigErrorOrNull(e);
    if (configError) {
      return NextResponse.json({ reply: configError.reply }, { status: configError.status });
    }
    console.error("[operator-jobs] enqueue failed", e);
    return NextResponse.json({ reply: "Operator jobs failed to queue." }, { status: 500 });
  }
}

async function findExistingMissionJob(
  db: ReturnType<typeof getDb>,
  dedupeKey: string,
): Promise<FeatureRequest | null> {
  const [row] = await db
    .select()
    .from(featureRequests)
    .where(
      and(
        eq(featureRequests.dedupeKey, dedupeKey),
        eq(featureRequests.source, "dashboard"),
      ),
    )
    .limit(1);
  return row ?? null;
}

