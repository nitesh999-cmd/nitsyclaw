import { NextResponse } from "next/server";
import { getDb, logAudit } from "@nitsyclaw/shared/db";
import { logDashboardError } from "../../../../lib/dashboard-runtime";
import {
  checkDashboardRateLimit,
  dashboardRateLimitHeaders,
} from "../../../../lib/dashboard-rate-limit";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const VALID_ACTIONS = new Set([
  "railway_auth_checked",
  "railway_restarted",
  "phone_proof_started",
  "phone_proof_passed",
  "phone_proof_failed",
]);

export async function POST(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const rateLimit = checkDashboardRateLimit(request, {
    scope: "whatsapp-recovery-log",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return new Response("Too many recovery actions. Please wait.", {
      status: 429,
      headers: { ...NO_STORE, ...dashboardRateLimitHeaders(rateLimit) },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Bad request", { status: 400, headers: NO_STORE });
  }

  const action = String(form.get("action") ?? "").trim();
  if (!VALID_ACTIONS.has(action)) {
    return new Response("Invalid recovery action", { status: 400, headers: NO_STORE });
  }

  const started = Date.now();
  try {
    await logAudit(getDb(), {
      actor: "user",
      tool: "whatsapp_recovery_action",
      input: { action },
      output: { recorded: true },
      success: true,
      durationMs: Date.now() - started,
    });
  } catch (e) {
    logDashboardError("whatsapp-recovery.log-action", e);
    return new Response("Could not record recovery action", { status: 500, headers: NO_STORE });
  }

  const url = new URL("/whatsapp-recovery", request.url);
  url.searchParams.set("logged", action);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
