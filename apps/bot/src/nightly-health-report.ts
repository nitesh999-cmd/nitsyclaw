import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { getSystemHeartbeat, type SystemHeartbeat } from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { buildBotRuntimeMetadata } from "./bot-runtime.js";

const CLIENT_STALE_MS = 2 * 60 * 1000;
const SEND_STALE_MS = 10 * 60 * 1000;
const LOOP_STALE_MS = 10 * 60 * 1000;
// Inbound events are sporadic, so freshness here is informational only.
const INBOUND_STALE_MS = 24 * 60 * 60 * 1000;
const RUNTIME_STALE_MS = 30 * 24 * 60 * 60 * 1000;

export interface NightlyHealthReportResult {
  status: "ready" | "needs_attention";
  body: string;
}

/**
 * Non-secret web research line. Reports the configured/operational/unavailable
 * state only — never the provider key, the model, or any environment value.
 */
export function formatWebResearchHealthLine(deps: Pick<AgentDeps, "liveResearch">): {
  line: string;
  unavailable: boolean;
} {
  const health = deps.liveResearch?.health();
  if (!health) return { line: "Web research: not reported", unavailable: false };
  const detail =
    health.state === "unavailable" && health.lastFailureCode
      ? ` - last failure: ${health.lastFailureCode}`
      : "";
  return {
    line: `Web research: ${health.state} (${health.provider}, max ${health.maxUses} searches/request)${detail}`,
    unavailable: health.state === "unavailable",
  };
}

export async function buildNightlyWhatsAppHealthReport(
  deps: Pick<AgentDeps, "db" | "now" | "timezone"> & Partial<Pick<AgentDeps, "liveResearch">>,
): Promise<NightlyHealthReportResult> {
  const now = deps.now();
  const [
    botRuntime,
    whatsappClient,
    whatsappSend,
    whatsappLoopGuard,
    whatsappInbound,
    scheduler,
    notifyChannels,
  ] = await Promise.all([
    getSystemHeartbeat(deps.db, "bot-runtime"),
    getSystemHeartbeat(deps.db, "whatsapp-client"),
    getSystemHeartbeat(deps.db, "whatsapp-send"),
    getSystemHeartbeat(deps.db, "whatsapp-loop-guard"),
    getSystemHeartbeat(deps.db, "whatsapp-inbound"),
    getSystemHeartbeat(deps.db, "bot-scheduler"),
    getSystemHeartbeat(deps.db, "notify-channels"),
  ]);
  const notifyFailures = heartbeatMetadataText(notifyChannels, "consecutiveAllChannelFailures");
  const notifyDetail =
    notifyChannels?.status === "error" && notifyFailures
      ? `${notifyFailures} consecutive all-channel failures`
      : undefined;

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
  // Inbound routing: a missing heartbeat just means no inbound traffic has been
  // classified yet. A degraded one means genuine owner self-chat messages are
  // failing identity resolution, so the report must not say "ready".
  const inboundIdentityFailures = Number(
    heartbeatMetadataText(whatsappInbound, "ownerSelfChatIdentityFailures") ?? 0,
  );
  const inboundDegraded =
    whatsappInbound !== null &&
    (whatsappInbound.status === "degraded" ||
      whatsappInbound.status === "error" ||
      inboundIdentityFailures > 0);
  const inboundDetail = inboundDegraded
    ? `owner self-chat identity resolution failing (${inboundIdentityFailures} in a row)`
    : undefined;
  // Explicit web research is a promised capability, so an unavailable searcher
  // must stop this report from claiming the system is ready.
  const webResearch = formatWebResearchHealthLine(deps);
  const status: NightlyHealthReportResult["status"] =
    clientFreshness === "ok" &&
    sendFreshness === "ok" &&
    loopFreshness === "ok" &&
    !inboundDegraded &&
    !sendError &&
    !loopReason &&
    !webResearch.unavailable
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
    heartbeatLine("Inbound routing", whatsappInbound, now, INBOUND_STALE_MS, inboundDetail),
    webResearch.line,
    // FYI only — doesn't affect `status` above. This report already arrives
    // via WhatsApp (the most reliable channel), so a dead ntfy/toast/mail
    // side-channel is worth a note but not itself a WhatsApp-readiness issue.
    heartbeatLine("Notify channels", notifyChannels, now, 24 * 60 * 60 * 1000, notifyDetail),
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
  deps: Pick<AgentDeps, "db" | "now" | "timezone" | "whatsapp"> & Partial<Pick<AgentDeps, "liveResearch">>,
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
