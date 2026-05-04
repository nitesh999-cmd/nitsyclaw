import { NextResponse } from "next/server";
import { isDashboardAuthConfigured } from "../../../../lib/dashboard-auth";
import {
  clearDashboardLoginAttempts,
  getDashboardLoginAttemptState,
  recordDashboardLoginFailure,
} from "../../../../lib/dashboard-login-attempts";
import { createDashboardSessionToken, DASHBOARD_SESSION_COOKIE } from "../../../../lib/dashboard-session";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const GLOBAL_LOGIN_FAILURE_KEY = "global:dashboard-login";

export async function POST(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const expectedPassword = process.env.NITSYCLAW_DASHBOARD_PASSWORD;
  const expectedUser = process.env.NITSYCLAW_DASHBOARD_USER || "nitesh";
  if (!isDashboardAuthConfigured({ nodeEnv: process.env.NODE_ENV, dashboardPassword: expectedPassword })) {
    return new Response("Dashboard auth is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const form = await request.formData();
  const user = String(form.get("user") ?? "");
  const password = String(form.get("password") ?? "");
  const next = sanitizeNext(String(form.get("next") ?? "/"));
  const clientKey = `ip:${clientKeyFromRequest(request)}`;

  const [clientState, globalState] = await Promise.all([
    getDashboardLoginAttemptState(clientKey),
    getDashboardLoginAttemptState(GLOBAL_LOGIN_FAILURE_KEY),
  ]);
  const lockedUntilMs = Math.max(clientState.lockedUntilMs ?? 0, globalState.lockedUntilMs ?? 0);
  if (lockedUntilMs > Date.now()) {
    return redirectToLogin("locked", next, 303);
  }

  if (!constantTimeEqual(user, expectedUser) || !constantTimeEqual(password, expectedPassword ?? "")) {
    const [updatedClient, updatedGlobal] = await Promise.all([
      recordDashboardLoginFailure(clientKey),
      recordDashboardLoginFailure(GLOBAL_LOGIN_FAILURE_KEY),
    ]);
    return redirectToLogin(updatedClient.lockedUntilMs || updatedGlobal.lockedUntilMs ? "locked" : "invalid", next, 303);
  }

  await Promise.all([
    clearDashboardLoginAttempts(clientKey),
    clearDashboardLoginAttempts(GLOBAL_LOGIN_FAILURE_KEY),
  ]);
  const token = await createDashboardSessionToken(expectedUser, expectedPassword ?? "");
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(DASHBOARD_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function redirectToLogin(error: "invalid" | "locked", next: string, status: 303): Response {
  const params = new URLSearchParams({ error, next });
  return NextResponse.redirect(`/login?${params.toString()}`, status);
}

function sanitizeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function clientKeyFromRequest(request: Request): string {
  const raw = (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
  return raw.replace(/[^\w:. -]/g, "").slice(0, 128) || "unknown";
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
