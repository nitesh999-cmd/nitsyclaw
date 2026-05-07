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
import {
  getOperatorRoadmapItem,
  OPERATOR_NEXT_50,
  type OperatorRoadmapItem,
} from "../../../command/operator-roadmap";
import { getOwnerIdentity, publicConfigErrorOrNull } from "../../../../lib/dashboard-runtime";
import { checkDashboardRateLimit, dashboardRateLimitHeaders } from "../../../../lib/dashboard-rate-limit";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BATCH = 20;
const MAX_NEXT_50 = 50;
const NO_STORE = { "Cache-Control": "no-store" };

type QueueAction = "queue_mission" | "queue_all" | "queue_next_50" | "queue_next_50_item";

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

  const rateLimit = checkDashboardRateLimit(request, { scope: "operator-jobs", limit: 10, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { reply: "Too many operator queue requests. Please wait a moment and try again." },
      { status: 429, headers: { ...NO_STORE, ...dashboardRateLimitHeaders(rateLimit) } },
    );
  }

  let rawBody: QueueBody;
  try {
    rawBody = (await request.json()) as QueueBody;
  } catch {
    return NextResponse.json({ reply: "Bad request" }, { status: 400, headers: NO_STORE });
  }

  const action = rawBody.action;
  if (
    action !== "queue_mission" &&
    action !== "queue_all" &&
    action !== "queue_next_50" &&
    action !== "queue_next_50_item"
  ) {
    return NextResponse.json({ reply: "Invalid operator job action" }, { status: 400, headers: NO_STORE });
  }

  let jobs: OperatorQueueJob[] = [];
  if (action === "queue_all") {
    jobs = OPERATOR_MISSIONS.slice(0, MAX_BATCH).map(missionToJob);
  } else if (action === "queue_next_50") {
    jobs = OPERATOR_NEXT_50.slice(0, MAX_NEXT_50).map(next50ToJob);
  } else if (action === "queue_next_50_item" && rawBody.missionId) {
    const item = getOperatorRoadmapItem(rawBody.missionId);
    jobs = item ? [next50ToJob(item)] : [];
  } else if (rawBody.missionId) {
    const mission = getOperatorMission(rawBody.missionId);
    jobs = mission ? [missionToJob(mission)] : [];
  }

  if (jobs.length === 0) {
    return NextResponse.json({ reply: "Unknown operator mission" }, { status: 400, headers: NO_STORE });
  }

  try {
    const db = getDb();
    const { ownerHash } = getOwnerIdentity();
    const results: QueueResult[] = [];

    for (const job of jobs) {
      const dedupeKey = job.dedupeKey;
      const existing = await findExistingMissionJob(db, dedupeKey);
      if (existing) {
        results.push({
          missionId: job.id,
          title: job.title,
          status: "existing",
          featureId: existing.id,
        });
        continue;
      }

      const row = await insertFeatureRequest(db, {
        description: job.description,
        type: "feature",
        severity: job.severity,
        size: job.size,
        source: "dashboard",
        requestedBy: ownerHash,
        dedupeKey,
        implementationNotes: job.implementationNotes,
      });
      results.push({
        missionId: job.id,
        title: job.title,
        status: "queued",
        featureId: row.id,
      });
    }

    const queued = results.filter((result) => result.status === "queued").length;
    const existing = results.length - queued;
    return NextResponse.json(
      {
        reply: `Operator jobs saved into Requests. Queued ${queued}; already existed ${existing}. This does not run code or deploy by itself.`,
        queued,
        existing,
        results,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    const configError = publicConfigErrorOrNull(e);
    if (configError) {
      return NextResponse.json({ reply: configError.reply }, { status: configError.status, headers: NO_STORE });
    }
    console.error("[operator-jobs] enqueue failed", e);
    return NextResponse.json({ reply: "Operator jobs failed to queue." }, { status: 500, headers: NO_STORE });
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

interface OperatorQueueJob {
  id: string;
  title: string;
  severity: OperatorMission["severity"];
  size: OperatorMission["size"];
  dedupeKey: string;
  description: string;
  implementationNotes: string;
}

function missionToJob(mission: OperatorMission): OperatorQueueJob {
  return {
    id: mission.id,
    title: mission.title,
    severity: mission.severity,
    size: mission.size,
    dedupeKey: `operator-mission:${mission.id}`,
    description: missionToQueueDescription(mission),
    implementationNotes: `Operator mission queued from /command. Category=${mission.category}. Outcome=${mission.outcome}`,
  };
}

function next50ToJob(item: OperatorRoadmapItem): OperatorQueueJob {
  return {
    id: item.id,
    title: item.title,
    severity: item.severity,
    size: item.size,
    dedupeKey: `operator-next-50:${item.id}`,
    description: `[${item.category}] ${item.title}: ${item.description} Why: ${item.why}`,
    implementationNotes: `Next-50 operator roadmap item queued from /command. Category=${item.category}. Why=${item.why}`,
  };
}
