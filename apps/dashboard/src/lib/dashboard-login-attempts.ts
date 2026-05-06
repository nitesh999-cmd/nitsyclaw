import { sql } from "drizzle-orm";
import { getDb } from "@nitsyclaw/shared/db";

export const DASHBOARD_AUTH_MAX_FAILURES = 5;
export const DASHBOARD_AUTH_LOCKOUT_MS = 15 * 60_000;

export interface DashboardLoginAttemptState {
  failures: number;
  lockedUntilMs?: number;
}

let ensureDashboardAuthAttemptsTablePromise: Promise<void> | undefined;

export async function getDashboardLoginAttemptState(
  clientKey: string,
  nowMs = Date.now(),
): Promise<DashboardLoginAttemptState> {
  const states = await getDashboardLoginAttemptStates([clientKey], nowMs);
  return states[clientKey] ?? { failures: 0 };
}

export async function getDashboardLoginAttemptStates(
  clientKeys: string[],
  nowMs = Date.now(),
): Promise<Record<string, DashboardLoginAttemptState>> {
  const uniqueKeys = Array.from(new Set(clientKeys.filter(Boolean)));
  if (uniqueKeys.length === 0) return {};

  const db = getDb();
  await ensureDashboardAuthAttemptsTable();
  const keyList = sql.join(uniqueKeys.map((key) => sql`${key}`), sql`, `);
  const result = await db.execute(sql`
    SELECT client_key, failures, locked_until
    FROM dashboard_auth_attempts
    WHERE client_key IN (${keyList})
  `);
  const rows = result as unknown as Array<{
    client_key?: string;
    failures?: number;
    locked_until?: Date | string | null;
  }>;
  const states = Object.fromEntries(uniqueKeys.map((key) => [key, { failures: 0 }])) as Record<string, DashboardLoginAttemptState>;

  const expiredKeys: string[] = [];
  for (const row of rows) {
    if (!row.client_key) continue;
    const lockedUntilMs = row.locked_until ? new Date(row.locked_until).getTime() : undefined;
    if (lockedUntilMs && lockedUntilMs <= nowMs) {
      expiredKeys.push(row.client_key);
      states[row.client_key] = { failures: 0 };
      continue;
    }
    states[row.client_key] = {
      failures: Number(row.failures ?? 0),
      lockedUntilMs,
    };
  }

  if (expiredKeys.length > 0) await clearDashboardLoginAttemptsForKeys(expiredKeys);
  return states;
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
  await clearDashboardLoginAttemptsForKeys([clientKey]);
}

export async function clearDashboardLoginAttemptsForKeys(clientKeys: string[]): Promise<void> {
  const uniqueKeys = Array.from(new Set(clientKeys.filter(Boolean)));
  if (uniqueKeys.length === 0) return;

  const db = getDb();
  await ensureDashboardAuthAttemptsTable();
  const keyList = sql.join(uniqueKeys.map((key) => sql`${key}`), sql`, `);
  await db.execute(sql`DELETE FROM dashboard_auth_attempts WHERE client_key IN (${keyList})`);
}

async function ensureDashboardAuthAttemptsTable(): Promise<void> {
  ensureDashboardAuthAttemptsTablePromise ??= createDashboardAuthAttemptsTable().catch((error) => {
    ensureDashboardAuthAttemptsTablePromise = undefined;
    throw error;
  });
  await ensureDashboardAuthAttemptsTablePromise;
}

async function createDashboardAuthAttemptsTable(): Promise<void> {
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

export function resetDashboardLoginAttemptTableCacheForTests(): void {
  ensureDashboardAuthAttemptsTablePromise = undefined;
}
