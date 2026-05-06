import { createHash } from "node:crypto";
import { DASHBOARD_SESSION_COOKIE } from "./dashboard-session";

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

export interface DashboardRateLimitOptions {
  scope: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}

export interface DashboardRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
}

const STORE_KEY = "__nitsyclaw_dashboard_rate_limit__";

type RateLimitStore = Map<string, RateLimitBucket>;

function getStore(): RateLimitStore {
  const root = globalThis as typeof globalThis & { [STORE_KEY]?: RateLimitStore };
  root[STORE_KEY] ??= new Map<string, RateLimitBucket>();
  return root[STORE_KEY];
}

export function checkDashboardRateLimit(
  request: Request,
  options: DashboardRateLimitOptions,
): DashboardRateLimitResult {
  const nowMs = options.nowMs ?? Date.now();
  const key = `${options.scope}:${clientKeyFromRequest(request)}`;
  const store = getStore();
  const current = store.get(key);

  if (!current || current.resetAtMs <= nowMs) {
    const resetAtMs = nowMs + options.windowMs;
    store.set(key, { count: 1, resetAtMs });
    return {
      allowed: true,
      limit: options.limit,
      remaining: Math.max(0, options.limit - 1),
      resetAtMs,
      retryAfterSec: 0,
    };
  }

  const count = current.count + 1;
  current.count = count;
  const remaining = Math.max(0, options.limit - count);
  const retryAfterSec = Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000));

  return {
    allowed: count <= options.limit,
    limit: options.limit,
    remaining,
    resetAtMs: current.resetAtMs,
    retryAfterSec,
  };
}

export function dashboardRateLimitHeaders(result: DashboardRateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(result.retryAfterSec),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAtMs / 1000)),
  };
}

export function resetDashboardRateLimitForTests(): void {
  getStore().clear();
}

function clientKeyFromRequest(request: Request): string {
  const session = sessionTokenFromRequest(request);
  if (session) return `session:${shortHash(session)}`;

  const rawIp = (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
  return `ip:${shortHash(rawIp.replace(/[^\w:. -]/g, "").slice(0, 128) || "unknown")}`;
}

function sessionTokenFromRequest(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const prefix = `${DASHBOARD_SESSION_COOKIE}=`;
  const part = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 16);
}
