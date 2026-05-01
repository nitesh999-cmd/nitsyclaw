export interface DashboardAuthEnv {
  nodeEnv?: string;
  dashboardUser?: string;
  dashboardPassword?: string;
}

export interface DashboardAuthResult {
  ok: boolean;
  reason?: "not-configured" | "missing-header" | "invalid";
}

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

export function checkDashboardAuth(header: string | null, env: DashboardAuthEnv): DashboardAuthResult {
  const configured = isDashboardAuthConfigured(env);

  if (!configured) {
    return env.nodeEnv === "production"
      ? { ok: false, reason: "not-configured" }
      : { ok: true };
  }

  const credentials = parseBasicAuth(header);
  if (!credentials) {
    return { ok: false, reason: "missing-header" };
  }

  const expectedUser = env.dashboardUser || "nitesh";
  if (credentials.user !== expectedUser || credentials.password !== env.dashboardPassword) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}
