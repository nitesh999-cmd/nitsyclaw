import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { getSystemHeartbeat, type SystemHeartbeat } from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { buildBotRuntimeMetadata } from "./bot-runtime.js";

const CLIENT_STALE_MS = 2 * 60 * 1000;
const SEND_STALE_MS = 10 * 60 * 1000;
const LOOP_STALE_MS = 10 * 60 * 1000;
const RUNTIME_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export interface NightlyHealthReportResult {
  status: "ready" | "needs_attention";
  body: string;
}

export async function buildNightlyWhatsAppHealthReport(
  deps: Pick<AgentDeps, "db" | "now" | "timezone">,
): Promise<NightlyHealthReportResult> {
  const now = deps.now();
  const [botRuntime, whatsappClient, whatsappSend, whatsappLoopGuard, scheduler] = await Promise.all([
    getSystemHeartbeat(deps.db, "bot-runtime"),
    getSystemHeartbeat(deps.db, "whatsapp-client"),
    getSystemHeartbeat(deps.db, "whatsapp-send"),
    getSystemHeartbeat(deps.db, "whatsapp-loop-guard"),
    getSystemHeartbeat(deps.db, "bot-scheduler"),
  ]);

  const runtime = buildBotRuntimeMetadata(process.env, now);
  const commit = heartbeatMetadataText(botRuntime, "commitShort")
    ?? heartbeatMetadataText(botRuntime, "commit")
    ?? runtime.commitShort;
  const loopReason = heartbeatMetadataText(whatsappLoopGuard, "reason");
  const loopResetAt = heartbeatMetadataText(whatsappLoopGuard, "resetAt");
  const sendError = heartbeatMetadataText(whatsappSend, "error");

  const clientFreshness = classifyHeartbeat(whatsappClient, now, CLIENT_STALE_MS);
  const sendFreshness = classifyHeartbeat(whatsappSend, now, SEND_STALE_MS);
  const loopFreshness = classifyHeartbeat(whatsappLoopGuard, now, LOOP_STALE_MS);
  const status: NightlyHealthReportResult["status"] =
    clientFreshness === "ok" &&
    sendFreshness === "ok" &&
    loopFreshness === "ok" &&
    !sendError &&
    !loopReason
      ? "ready"
      : "needs_attention";

  const localTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: deps.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  const details = [
    heartbeatLine("Bot runtime", botRuntime, now, RUNTIME_STALE_MS),
    heartbeatLine("Scheduler", scheduler, now, 3 * 60 * 1000),
    heartbeatLine("WhatsApp client", whatsappClient, now, CLIENT_STALE_MS),
    heartbeatLine("WhatsApp send", whatsappSend, now, SEND_STALE_MS, sendError ? `last error: ${sendError}` : undefined),
    heartbeatLine(
      "Loop guard",
      whatsappLoopGuard,
      now,
      LOOP_STALE_MS,
      loopReason ? `reason: ${loopReason}${loopResetAt ? `, resets ${loopResetAt}` : ""}` : undefined,
    ),
  ];

  return {
    status,
    body: [
      "Nightly WhatsApp health",
      `Status: ${status === "ready" ? "ready" : "needs attention"}`,
      `Time: ${localTime}`,
      `Version: commit ${commit}`,
      "",
      ...details.map((line) => `- ${line}`),
      "",
      "Provider setup is not tested here.",
      status === "ready"
        ? "Next: send proof test if you want a live manual check."
        : "Next: send what went wrong or proof details.",
    ].join("\n"),
  };
}

export async function sendNightlyWhatsAppHealthReport(
  deps: Pick<AgentDeps, "db" | "now" | "timezone" | "whatsapp">,
  ownerPhone: string,
): Promise<NightlyHealthReportResult> {
  const report = await buildNightlyWhatsAppHealthReport(deps);
  await deps.whatsapp.send({ to: ownerPhone, body: report.body });
  return report;
}

function heartbeatLine(
  label: string,
  heartbeat: SystemHeartbeat | null,
  now: Date,
  staleAfterMs: number,
  detail?: string,
): string {
  const freshness = classifyHeartbeat(heartbeat, now, staleAfterMs);
  if (!heartbeat) return `${label}: missing`;
  const ageSeconds = Math.max(0, Math.round((now.getTime() - heartbeat.lastSeenAt.getTime()) / 1000));
  const suffix = detail ? ` - ${detail}` : "";
  return `${label}: ${heartbeat.status} (${freshness}, ${ageSeconds}s ago)${suffix}`;
}

function heartbeatMetadataText(heartbeat: SystemHeartbeat | null, key: string): string | null {
  const metadata = heartbeat?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  return String(value).slice(0, 160);
}
