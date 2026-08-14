import type { SystemHeartbeat } from "@nitsyclaw/shared/db";

export type WhatsAppHealthState =
  | "healthy"
  | "idle"
  | "stale"
  | "degraded"
  | "failed"
  | "not tested"
  | "not applicable";

const FAILED = new Set(["error", "failed", "auth_failure", "disconnected"]);
const DEGRADED = new Set(["degraded", "paused", "cooldown", "restarting", "qr_required"]);

export function classifyWhatsAppHealthSignal(args: {
  heartbeat: SystemHeartbeat | null;
  now: Date;
  staleAfterMs: number;
  kind: "periodic" | "event";
}): WhatsAppHealthState {
  const { heartbeat } = args;
  if (!heartbeat) return "not tested";
  const status = heartbeat.status.trim().toLowerCase().replaceAll("-", "_");
  if (status === "not_applicable") return "not applicable";
  if (FAILED.has(status)) return "failed";
  if (DEGRADED.has(status)) return "degraded";

  const ageMs = Math.max(0, args.now.getTime() - heartbeat.lastSeenAt.getTime());
  if (ageMs <= args.staleAfterMs) return "healthy";
  return args.kind === "event" ? "idle" : "stale";
}

export function requiresWhatsAppAttention(state: WhatsAppHealthState): boolean {
  return state === "stale" || state === "degraded" || state === "failed";
}
