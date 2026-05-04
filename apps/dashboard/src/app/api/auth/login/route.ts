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
  const clientKey = clientKeyFromRequest(request);

  const state = await getDashboardLoginAttemptState(clientKey);
  if (state.lockedUntilMs && state.lockedUntilMs > Date.now()) {
    return redirectToLogin("locked", next, 303);
  }

  if (!constantTimeEqual(user, expectedUser) || !constantTimeEqual(password, expectedPassword ?? "")) {
    const updated = await recordDashboardLoginFailure(clientKey);
    return redirectToLogin(updated.lockedUntilMs ? "locked" : "invalid", next, 303);
  }

  await clearDashboardLoginAttempts(clientKey);
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
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("user-agent") ||
    "unknown"
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
