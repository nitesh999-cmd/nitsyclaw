import type { HeartbeatFreshness } from "@nitsyclaw/shared/ops/heartbeat";

export type SloTone = "good" | "watch" | "bad";

export interface OpsSloInput {
  dashboardOk: boolean;
  botFreshness: HeartbeatFreshness;
  botFreshMinutes: number | null;
  queueOldestHours: number;
  apiP95LatencyMs: number | null;
  failedToolRate: number | null;
  liveSmokeFreshness: HeartbeatFreshness;
}

export interface OpsSloIndicator {
  key: string;
  label: string;
  target: string;
  value: string;
  passed: boolean;
  tone: SloTone;
  detail: string;
}

export interface OpsSloDashboard {
  score: number;
  status: "healthy" | "watch" | "action";
  indicators: OpsSloIndicator[];
}

export function buildOpsSloDashboard(input: OpsSloInput): OpsSloDashboard {
  const indicators: OpsSloIndicator[] = [
    {
      key: "dashboard",
      label: "Dashboard availability",
      target: "Health page can load",
      value: input.dashboardOk ? "ok" : "down",
      passed: input.dashboardOk,
      tone: input.dashboardOk ? "good" : "bad",
      detail: input.dashboardOk ? "Dashboard database-backed health loaded." : "Dashboard health data failed to load.",
    },
    {
      key: "bot-freshness",
      label: "Bot freshness",
      target: "Bot heartbeat under 10m",
      value: input.botFreshMinutes === null ? "missing" : `${Math.round(input.botFreshMinutes)}m`,
      passed: input.botFreshness === "ok" && input.botFreshMinutes !== null && input.botFreshMinutes <= 10,
      tone: input.botFreshness === "ok" && input.botFreshMinutes !== null && input.botFreshMinutes <= 10 ? "good" : "bad",
      detail: "Shows whether the WhatsApp worker is alive recently enough for user trust.",
    },
    {
      key: "queue-age",
      label: "Queue age",
      target: "Oldest open request under 24h",
      value: `${Math.round(input.queueOldestHours)}h`,
      passed: input.queueOldestHours <= 24,
      tone: input.queueOldestHours <= 24 ? "good" : input.queueOldestHours <= 72 ? "watch" : "bad",
      detail: "Keeps pending build requests from silently going stale.",
    },
    {
      key: "api-latency",
      label: "API latency",
      target: "P95 tool/API call under 2s",
      value: input.apiP95LatencyMs === null ? "no data" : `${Math.round(input.apiP95LatencyMs)}ms`,
      passed: input.apiP95LatencyMs !== null && input.apiP95LatencyMs <= 2_000,
      tone: input.apiP95LatencyMs === null ? "watch" : input.apiP95LatencyMs <= 2_000 ? "good" : input.apiP95LatencyMs <= 5_000 ? "watch" : "bad",
      detail: "Uses the latest audit log durations to catch slow or stuck tool paths.",
    },
    {
      key: "failed-tool-rate",
      label: "Failed tool rate",
      target: "Under 5% in last 24h",
      value: input.failedToolRate === null ? "no data" : `${Math.round(input.failedToolRate * 100)}%`,
      passed: input.failedToolRate !== null && input.failedToolRate <= 0.05,
      tone: input.failedToolRate === null ? "watch" : input.failedToolRate <= 0.05 ? "good" : input.failedToolRate <= 0.15 ? "watch" : "bad",
      detail: "Counts failed audit-log rows against total recent tool calls.",
    },
    {
      key: "live-smoke",
      label: "Live smoke status",
      target: "Smoke proof recorded under 24h",
      value: input.liveSmokeFreshness,
      passed: input.liveSmokeFreshness === "ok",
      tone: input.liveSmokeFreshness === "ok" ? "good" : input.liveSmokeFreshness === "stale" ? "watch" : "bad",
      detail: "Tracks whether a production smoke proof has been recorded recently.",
    },
  ];

  const passed = indicators.filter((indicator) => indicator.passed).length;
  const score = Math.round((passed / indicators.length) * 100);
  return {
    score,
    status: score >= 85 ? "healthy" : score >= 60 ? "watch" : "action",
    indicators,
  };
}

export function p95(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? null;
}

export function heartbeatAgeMinutes(heartbeat: { lastSeenAt: Date } | null, now: Date): number | null {
  if (!heartbeat) return null;
  return Math.max(0, (now.getTime() - heartbeat.lastSeenAt.getTime()) / 60_000);
}
