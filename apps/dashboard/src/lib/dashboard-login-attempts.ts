import { sql } from "drizzle-orm";
import { getDb } from "@nitsyclaw/shared/db";

export const DASHBOARD_AUTH_MAX_FAILURES = 5;
export const DASHBOARD_AUTH_LOCKOUT_MS = 15 * 60_000;

export interface DashboardLoginAttemptState {
  failures: number;
  lockedUntilMs?: number;
}

export async function getDashboardLoginAttemptState(
  clientKey: string,
  nowMs = Date.now(),
): Promise<DashboardLoginAttemptState> {
  const db = getDb();
  await ensureDashboardAuthAttemptsTable();
  const result = await db.execute(sql`
    SELECT failures, locked_until
    FROM dashboard_auth_attempts
    WHERE client_key = ${clientKey}
    LIMIT 1
  `);
  const rows = result as unknown as Array<{ failures?: number; locked_until?: Date | string | null }>;
  const row = rows[0];
  if (!row) return { failures: 0 };

  const lockedUntilMs = row.locked_until ? new Date(row.locked_until).getTime() : undefined;
  if (lockedUntilMs && lockedUntilMs <= nowMs) {
    await clearDashboardLoginAttempts(clientKey);
    return { failures: 0 };
  }

  return {
    failures: Number(row.failures ?? 0),
    lockedUntilMs,
  };
}

export async function recordDashboardLoginFailure(
  clientKey: string,
  nowMs = Date.now(),
  maxFailures = DASHBOARD_AUTH_MAX_FAILURES,
): Promise<DashboardLoginAttemptState> {
  const current = await getDashboardLoginAttemptState(clientKey, nowMs);
  const failures = current.lockedUntilMs && current.lockedUntilMs > nowMs
    ? current.failures
    : current.failures + 1;
  const lockedUntilMs = failures >= maxFailures
    ? nowMs + DASHBOARD_AUTH_LOCKOUT_MS
    : undefined;

  const db = getDb();
  await db.execute(sql`
    INSERT INTO dashboard_auth_attempts (client_key, failures, locked_until, updated_at)
    VALUES (${clientKey}, ${failures}, ${lockedUntilMs ? new Date(lockedUntilMs) : null}, NOW())
    ON CONFLICT (client_key)
    DO UPDATE SET
      failures = EXCLUDED.failures,
      locked_until = EXCLUDED.locked_until,
      updated_at = NOW()
  `);

  return { failures, lockedUntilMs };
}

export async function clearDashboardLoginAttempts(clientKey: string): Promise<void> {
  const db = getDb();
  await ensureDashboardAuthAttemptsTable();
  await db.execute(sql`DELETE FROM dashboard_auth_attempts WHERE client_key = ${clientKey}`);
}

async function ensureDashboardAuthAttemptsTable(): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dashboard_auth_attempts (
      client_key text PRIMARY KEY,
      failures integer NOT NULL DEFAULT 0,
      locked_until timestamp with time zone,
      updated_at timestamp with time zone NOT NULL DEFAULT NOW()
    )
  `);
}
