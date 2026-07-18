import { NextResponse } from "next/server";
import { requireSameOrigin } from "../../../../lib/request-origin";
import {
  assertProspectDemoSafeEnv,
  runProspectDemoAction,
  type ProspectDemoAction,
} from "../../../local-brain/prospect-demo-fixture";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<ProspectDemoAction>(["reset", "focus", "correct", "recall", "propose", "status"]);

export async function POST(request: Request) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    assertProspectDemoSafeEnv();
    const body = await request.json() as { action?: string; text?: string };
    if (!body.action || !ACTIONS.has(body.action as ProspectDemoAction)) {
      return NextResponse.json({ error: "Unknown prospect demo action." }, { status: 400 });
    }
    const result = await runProspectDemoAction(body.action as ProspectDemoAction, String(body.text ?? "").slice(0, 500));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prospect demo unavailable.";
    return NextResponse.json({ error: message }, { status: /not enabled|blocked|refused|requires/i.test(message) ? 403 : 500 });
  }
}
