export interface DashboardAuthEnv {
  nodeEnv?: string;
  dashboardUser?: string;
  dashboardPassword?: string;
}

export interface DashboardAuthResult {
  ok: boolean;
  reason?: "not-configured" | "missing-header" | "invalid" | "locked";
}

export interface DashboardAuthOptions {
  clientKey?: string;
  nowMs?: number;
}

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

const attempts = new Map<string, { failures: number; lockedUntilMs?: number }>();

export function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;

    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function isDashboardAuthConfigured(env: DashboardAuthEnv): boolean {
  return Boolean(env.dashboardPassword && env.dashboardPassword.length > 0);
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function authState(clientKey: string) {
  return attempts.get(clientKey) ?? { failures: 0 };
}

export function clearDashboardAuthAttempts(): void {
  attempts.clear();
}

export function recordDashboardAuthFailure(clientKey: string, nowMs = Date.now()): void {
  const current = authState(clientKey);
  const failures = current.lockedUntilMs && current.lockedUntilMs > nowMs
    ? current.failures
    : current.failures + 1;
  attempts.set(clientKey, {
    failures,
    lockedUntilMs: failures >= MAX_FAILURES ? nowMs + LOCKOUT_MS : undefined,
  });
}

function isLocked(clientKey: string, nowMs: number): boolean {
  const current = authState(clientKey);
  if (!current.lockedUntilMs) return false;
  if (current.lockedUntilMs <= nowMs) {
    attempts.delete(clientKey);
    return false;
  }
  return true;
}

export function checkDashboardAuth(
  header: string | null,
  env: DashboardAuthEnv,
  options: DashboardAuthOptions = {},
): DashboardAuthResult {
  const configured = isDashboardAuthConfigured(env);
  const clientKey = options.clientKey ?? "default";
  const nowMs = options.nowMs ?? Date.now();

  if (!configured) {
    return env.nodeEnv === "production"
      ? { ok: false, reason: "not-configured" }
      : { ok: true };
  }

  if (isLocked(clientKey, nowMs)) {
    return { ok: false, reason: "locked" };
  }

  const credentials = parseBasicAuth(header);
  if (!credentials) {
    recordDashboardAuthFailure(clientKey, nowMs);
    return { ok: false, reason: "missing-header" };
  }

  const expectedUser = env.dashboardUser || "nitesh";
  if (
    !constantTimeEqual(credentials.user, expectedUser) ||
    !constantTimeEqual(credentials.password, env.dashboardPassword ?? "")
  ) {
    recordDashboardAuthFailure(clientKey, nowMs);
    return { ok: false, reason: "invalid" };
  }

  attempts.delete(clientKey);
  return { ok: true };
}
