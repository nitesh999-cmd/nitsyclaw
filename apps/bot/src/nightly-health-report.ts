import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { getSystemHeartbeat, type SystemHeartbeat } from "@nitsyclaw/shared/db";
import { buildBotRuntimeMetadata } from "./bot-runtime.js";
import {
  classifyWhatsAppHealthSignal,
  requiresWhatsAppAttention,
  type WhatsAppHealthState,
} from "./whatsapp-health-classification.js";

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

export async function buildNightlyWhatsAppHealthReport(
  deps: Pick<AgentDeps, "db" | "now" | "timezone">,
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
  const recordedCommit = heartbeatMetadataText(botRuntime, "commitShort")
    ?? heartbeatMetadataText(botRuntime, "commit");
  const commit = recordedCommit && !["unknown", "unavailable"].includes(recordedCommit.toLowerCase())
    ? recordedCommit
    : runtime.commitShort;
  const loopReason = heartbeatMetadataText(whatsappLoopGuard, "reason");
  const loopResetAt = heartbeatMetadataText(whatsappLoopGuard, "resetAt");
  const sendError = heartbeatMetadataText(whatsappSend, "error");

  const runtimeState = classifySignal(botRuntime, now, RUNTIME_STALE_MS, "periodic");
  const schedulerState = classifySignal(scheduler, now, 3 * 60 * 1000, "periodic");
  const clientState = classifySignal(whatsappClient, now, CLIENT_STALE_MS, "periodic");
  const sendState = classifySignal(whatsappSend, now, SEND_STALE_MS, "event");
  const loopState = classifySignal(whatsappLoopGuard, now, LOOP_STALE_MS, "periodic");
  const inboundState = classifySignal(whatsappInbound, now, INBOUND_STALE_MS, "event");
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
  const status: NightlyHealthReportResult["status"] =
    runtimeState === "healthy" &&
    schedulerState === "healthy" &&
    clientState === "healthy" &&
    !requiresWhatsAppAttention(sendState) &&
    loopState === "healthy" &&
    !inboundDegraded &&
    !requiresWhatsAppAttention(inboundState) &&
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
    heartbeatLine("Bot runtime", botRuntime, now, RUNTIME_STALE_MS, "periodic"),
    heartbeatLine("Scheduler", scheduler, now, 3 * 60 * 1000, "periodic"),
    heartbeatLine("WhatsApp client", whatsappClient, now, CLIENT_STALE_MS, "periodic"),
    heartbeatLine("WhatsApp send", whatsappSend, now, SEND_STALE_MS, "event", sendError ? `last error: ${sendError}` : undefined),
    heartbeatLine(
      "Loop guard",
      whatsappLoopGuard,
      now,
      LOOP_STALE_MS,
      "periodic",
      loopReason ? `reason: ${loopReason}${loopResetAt ? `, resets ${loopResetAt}` : ""}` : undefined,
    ),
    heartbeatLine("Inbound routing", whatsappInbound, now, INBOUND_STALE_MS, "event", inboundDetail),
    // FYI only — doesn't affect `status` above. This report already arrives
    // via WhatsApp (the most reliable channel), so a dead ntfy/toast/mail
    // side-channel is worth a note but not itself a WhatsApp-readiness issue.
    heartbeatLine("Notify channels", notifyChannels, now, 24 * 60 * 60 * 1000, "event", notifyDetail),
  ];

  return {
    status,
    body: [
      "Nightly WhatsApp health",
      `Status: ${status === "ready" ? "ready" : "needs attention"}`,
      `Time: ${localTime}`,
      `Version: commit ${commit}${commit === "unavailable" ? ` (${runtime.commitReason})` : ""}`,
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
  kind: "periodic" | "event",
  detail?: string,
): string {
  const state = classifySignal(heartbeat, now, staleAfterMs, kind);
  if (!heartbeat) return `${label}: not tested`;
  const ageSeconds = Math.max(0, Math.round((now.getTime() - heartbeat.lastSeenAt.getTime()) / 1000));
  const suffix = detail ? ` - ${detail}` : "";
  return `${label}: ${heartbeat.status} (${state}, ${ageSeconds}s ago)${suffix}`;
}

function classifySignal(
  heartbeat: SystemHeartbeat | null,
  now: Date,
  staleAfterMs: number,
  kind: "periodic" | "event",
): WhatsAppHealthState {
  return classifyWhatsAppHealthSignal({ heartbeat, now, staleAfterMs, kind });
}

function heartbeatMetadataText(heartbeat: SystemHeartbeat | null, key: string): string | null {
  const metadata = heartbeat?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  return String(value).slice(0, 160);
}
