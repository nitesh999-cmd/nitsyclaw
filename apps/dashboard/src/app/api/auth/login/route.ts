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
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const expectedPassword = process.env.NITSYCLAW_DASHBOARD_PASSWORD;
  const expectedUser = process.env.NITSYCLAW_DASHBOARD_USER || "nitesh";
  if (!isDashboardAuthConfigured({ nodeEnv: process.env.NODE_ENV, dashboardPassword: expectedPassword })) {
    return new Response("Dashboard auth is not configured", {
      status: 503,
      headers: NO_STORE,
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Bad request", { status: 400, headers: NO_STORE });
  }
  const user = String(form.get("user") ?? "");
  const password = String(form.get("password") ?? "");
  const next = sanitizeNext(String(form.get("next") ?? "/"));
  const clientKey = `ip:${clientKeyFromRequest(request)}`;
  const accountKey = accountKeyFromUser(user, expectedUser);

  const now = Date.now();
  const [clientState, accountState] = await Promise.all([
    getDashboardLoginAttemptState(clientKey, now),
    getDashboardLoginAttemptState(accountKey, now),
  ]);
  if (
    (clientState.lockedUntilMs && clientState.lockedUntilMs > now) ||
    (accountState.lockedUntilMs && accountState.lockedUntilMs > now)
  ) {
    return redirectToLogin("locked", next, 303);
  }

  if (!constantTimeEqual(user, expectedUser) || !constantTimeEqual(password, expectedPassword ?? "")) {
    const [updatedClient, updatedAccount] = await Promise.all([
      recordDashboardLoginFailure(clientKey, now),
      recordDashboardLoginFailure(accountKey, now),
    ]);
    return redirectToLogin(
      updatedClient.lockedUntilMs || updatedAccount.lockedUntilMs ? "locked" : "invalid",
      next,
      303,
    );
  }

  await Promise.all([
    clearDashboardLoginAttempts(clientKey),
    clearDashboardLoginAttempts(accountKey),
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

function accountKeyFromUser(user: string, expectedUser: string): string {
  const normalized = normalizeAccountUser(user);
  const expected = normalizeAccountUser(expectedUser);
  if (normalized && normalized === expected) return `account:${expected}`;
  return `account-submitted:${normalized || "unknown"}`;
}

function normalizeAccountUser(user: string): string {
  return user.trim().toLowerCase().replace(/[^\w@.+-]/g, "").slice(0, 128);
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
