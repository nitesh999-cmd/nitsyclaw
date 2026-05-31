import type { HeartbeatFreshness } from "@nitsyclaw/shared/ops/heartbeat";

export type OpsAlertSeverity = "P1" | "P2" | "P3";

export interface OpsAlert {
  key: string;
  severity: OpsAlertSeverity;
  title: string;
  detail: string;
  action: string;
}

export interface OpsAlertInput {
  botFreshness: HeartbeatFreshness;
  whatsappFreshness: HeartbeatFreshness;
  whatsappSendFreshness: HeartbeatFreshness;
  whatsappSendStatus?: string | null;
  loopGuardStatus?: string | null;
  failedCommandJobs: number;
  retryingCommandJobs: number;
  failedToolRate: number | null;
  recentFailures24h: number;
  activeAuthLockouts: number;
  liveSmokeFreshness: HeartbeatFreshness;
  liveSmokeStatus?: string | null;
  missingEnvLabels: string[];
}

export function buildOpsAlerts(input: OpsAlertInput): OpsAlert[] {
  const alerts: OpsAlert[] = [];

  if (input.botFreshness !== "ok" || input.whatsappFreshness !== "ok") {
    alerts.push({
      key: "stale-whatsapp-bot",
      severity: "P1",
      title: "WhatsApp bot may be stale",
      detail: `Bot heartbeat is ${input.botFreshness}; WhatsApp client is ${input.whatsappFreshness}.`,
      action: "Open WhatsApp recovery, inspect Railway logs, then restart only after the fatal line is known.",
    });
  }

  if (input.whatsappSendFreshness !== "ok" || input.whatsappSendStatus === "error") {
    alerts.push({
      key: "whatsapp-send-failure",
      severity: "P1",
      title: "WhatsApp sends need proof",
      detail: `Send heartbeat is ${input.whatsappSendFreshness}${input.whatsappSendStatus ? ` with status ${input.whatsappSendStatus}` : ""}.`,
      action: "Run proof test from WhatsApp and production smoke before adding new WhatsApp features.",
    });
  }

  if (input.loopGuardStatus === "paused") {
    alerts.push({
      key: "loop-guard-paused",
      severity: "P1",
      title: "Loop guard paused replies",
      detail: "The bot is protecting WhatsApp from repeated sends.",
      action: "Use what went wrong, confirm the send burst has stopped, then resume WhatsApp.",
    });
  }

  if (input.failedCommandJobs > 0 || input.retryingCommandJobs > 0) {
    alerts.push({
      key: "failed-queue-jobs",
      severity: input.failedCommandJobs > 0 ? "P1" : "P2",
      title: "Queue jobs need attention",
      detail: `${input.failedCommandJobs} failed and ${input.retryingCommandJobs} retrying command job(s).`,
      action: "Open the command page, inspect the latest failed job, and fix the first repeatable failure.",
    });
  }

  if ((input.failedToolRate ?? 0) > 0.15 || input.recentFailures24h > 10) {
    alerts.push({
      key: "high-error-rate",
      severity: "P1",
      title: "High tool failure rate",
      detail: `${percent(input.failedToolRate)} failed tool rate and ${input.recentFailures24h} failed calls in 24h.`,
      action: "Check the incident timeline and latest audit signal before shipping more feature work.",
    });
  } else if ((input.failedToolRate ?? 0) > 0.05 || input.recentFailures24h > 3) {
    alerts.push({
      key: "elevated-error-rate",
      severity: "P2",
      title: "Tool failures are elevated",
      detail: `${percent(input.failedToolRate)} failed tool rate and ${input.recentFailures24h} failed calls in 24h.`,
      action: "Review the latest failed audit rows and add a focused regression test if the failure repeats.",
    });
  }

  if (input.activeAuthLockouts > 0) {
    alerts.push({
      key: "auth-lockouts",
      severity: "P2",
      title: "Dashboard auth lockouts active",
      detail: `${input.activeAuthLockouts} active lockout(s).`,
      action: "Confirm this is expected owner protection, not a broken login or attack pattern.",
    });
  }

  if (input.liveSmokeFreshness !== "ok" || input.liveSmokeStatus === "error") {
    alerts.push({
      key: "failed-production-smoke",
      severity: "P1",
      title: "Production smoke proof is missing or failed",
      detail: `Live smoke heartbeat is ${input.liveSmokeFreshness}${input.liveSmokeStatus ? ` with status ${input.liveSmokeStatus}` : ""}.`,
      action: "Run pnpm release:live-smoke and do not call the deploy healthy until it passes.",
    });
  }

  if (input.missingEnvLabels.length > 0) {
    alerts.push({
      key: "missing-env",
      severity: input.missingEnvLabels.includes("WhatsApp owner") ? "P1" : "P3",
      title: "Required configuration is missing",
      detail: `Missing or incomplete: ${input.missingEnvLabels.join(", ")}.`,
      action: "Fix environment configuration before testing the affected feature path.",
    });
  }

  return alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function percent(value: number | null): string {
  if (value === null) return "no data";
  return `${Math.round(value * 100)}%`;
}

function severityRank(severity: OpsAlertSeverity): number {
  if (severity === "P1") return 1;
  if (severity === "P2") return 2;
  return 3;
}
