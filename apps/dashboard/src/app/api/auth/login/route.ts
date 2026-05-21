import { NextResponse } from "next/server";
import { isDashboardAuthConfigured } from "../../../../lib/dashboard-auth";
import {
  clearDashboardLoginAttemptsForKeys,
  getDashboardLoginAttemptStates,
  recordDashboardLoginFailure,
} from "../../../../lib/dashboard-login-attempts";
import type { DashboardLoginAttemptState } from "../../../../lib/dashboard-login-attempts";
import { createDashboardSessionToken, DASHBOARD_SESSION_COOKIE } from "../../../../lib/dashboard-session";
import { logDashboardError } from "../../../../lib/dashboard-runtime";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const DEFAULT_AUTH_ATTEMPT_TIMEOUT_MS = 800;
const DEFAULT_LOGIN_NEXT = "/onboarding";

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
  const next = sanitizeNext(String(form.get("next") ?? DEFAULT_LOGIN_NEXT));
  const clientKey = `ip:${clientKeyFromRequest(request)}`;
  const accountKey = accountKeyFromUser(user, expectedUser);
  const loginKeys = [clientKey, accountKey];
  const credentialsValid = constantTimeEqual(user, expectedUser) && constantTimeEqual(password, expectedPassword ?? "");

  if (credentialsValid) {
    void withAuthAttemptTimeout(
      clearDashboardLoginAttemptsForKeys(loginKeys),
      "clear login attempts",
    );
    return createLoginResponse(request, next, expectedUser, expectedPassword ?? "");
  }

  const now = Date.now();
  const states = await withAuthAttemptTimeout(
    getDashboardLoginAttemptStates(loginKeys, now),
    "load login attempt state",
  );
  if (!states) return authProtectionUnavailable();

  const clientState = states[clientKey] ?? { failures: 0 };
  const accountState = states[accountKey] ?? { failures: 0 };
  if (
    (clientState.lockedUntilMs && clientState.lockedUntilMs > now) ||
    (accountState.lockedUntilMs && accountState.lockedUntilMs > now)
  ) {
    const lockedUntil = latestLockUntil(clientState, accountState);
    const retryAfterSec = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    const res = redirectToLogin("locked", next, 303);
    res.headers.set("Retry-After", String(retryAfterSec));
    return res;
  }

  const updatedStates = await withAuthAttemptTimeout(
    Promise.all([
      recordDashboardLoginFailure(clientKey, now),
      recordDashboardLoginFailure(accountKey, now),
    ]),
    "record login failure",
  );
  if (!updatedStates) return authProtectionUnavailable();
  const [updatedClient, updatedAccount] = updatedStates;
  return redirectToLogin(
    updatedClient.lockedUntilMs || updatedAccount.lockedUntilMs ? "locked" : "invalid",
    next,
    303,
  );
}

async function createLoginResponse(
  request: Request,
  next: string,
  expectedUser: string,
  expectedPassword: string,
): Promise<Response> {
  const token = await createDashboardSessionToken(expectedUser, expectedPassword);
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

function redirectToLogin(error: "invalid" | "locked", next: string, status: 303): ReturnType<typeof NextResponse.redirect> {
  const params = new URLSearchParams({ error, next });
  return NextResponse.redirect(`/login?${params.toString()}`, status);
}

function sanitizeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_LOGIN_NEXT;
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

function authAttemptTimeoutMs(): number {
  const parsed = Number(process.env.NITSYCLAW_AUTH_ATTEMPT_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 5_000) return parsed;
  return DEFAULT_AUTH_ATTEMPT_TIMEOUT_MS;
}

function authProtectionUnavailable(): Response {
  return new Response("Login protection is temporarily unavailable. Please try again shortly.", {
    status: 503,
    headers: NO_STORE,
  });
}

function latestLockUntil(...states: DashboardLoginAttemptState[]): number {
  return Math.max(...states.map((state) => state.lockedUntilMs ?? 0));
}

async function withAuthAttemptTimeout<T>(promise: Promise<T>, label: string): Promise<T | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<undefined>((resolve) => {
    timeout = setTimeout(() => {
      console.error("[dashboard-auth] operation timed out; failing closed", { label });
      resolve(undefined);
    }, authAttemptTimeoutMs());
  });

  try {
    return await Promise.race([
      promise.catch((error) => {
        logDashboardError(`auth.${label}`, error);
        return undefined;
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
