import type { SystemHeartbeat } from "../db/schema.js";

export type HeartbeatFreshness = "ok" | "stale" | "missing";

export function classifyHeartbeat(
  heartbeat: Pick<SystemHeartbeat, "lastSeenAt"> | null,
  now: Date,
  staleAfterMs = 3 * 60 * 1000,
): HeartbeatFreshness {
  if (!heartbeat) return "missing";
  const ageMs = now.getTime() - heartbeat.lastSeenAt.getTime();
  return ageMs < -30 * 1000 || ageMs > staleAfterMs ? "stale" : "ok";
}
