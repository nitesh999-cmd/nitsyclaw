export type IncidentSeverity = "P1" | "P2" | "P3";
export type IncidentStatus = "open" | "recovered" | "watch";

export interface IncidentAuditRow {
  id?: string;
  tool: string;
  success: boolean;
  error?: string | null;
  durationMs?: number | null;
  createdAt: Date | string;
}

export interface IncidentCommandJobRow {
  id?: string;
  source: "whatsapp" | "dashboard";
  command: string;
  status: "received" | "working" | "needs_clarification" | "needs_approval" | "done" | "failed" | "retrying";
  error?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt?: Date | string | null;
}

export interface IncidentHeartbeatRow {
  source: string;
  status: string;
  lastSeenAt: Date | string;
}

export interface IncidentTimelineInput {
  auditRows: IncidentAuditRow[];
  commandJobs: IncidentCommandJobRow[];
  heartbeats: Array<IncidentHeartbeatRow | null>;
  now?: Date;
}

export interface IncidentTimelineItem {
  id: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  detectedAt: Date;
  symptom: string;
  affectedSurfaces: string[];
  actionsTaken: string[];
  recoveryProof: string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function minutesSince(value: Date | string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - toDate(value).getTime()) / 60_000));
}

function compactText(value: string | null | undefined, fallback = "No detail recorded"): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function surfaceForTool(tool: string): string {
  const lowered = tool.toLowerCase();
  if (lowered.includes("whatsapp")) return "WhatsApp";
  if (lowered.includes("operator") || lowered.includes("queue")) return "Operator queue";
  if (lowered.includes("reminder")) return "Reminders";
  if (lowered.includes("expense") || lowered.includes("receipt")) return "Expenses";
  if (lowered.includes("bill") || lowered.includes("document")) return "Bills/documents";
  if (lowered.includes("auth") || lowered.includes("login")) return "Dashboard auth";
  return "Tool/API route";
}

function statusForRecovered(recovered: boolean, watch = false): IncidentStatus {
  if (recovered) return "recovered";
  return watch ? "watch" : "open";
}

export function buildIncidentTimeline(input: IncidentTimelineInput): {
  status: "clear" | "watch" | "action";
  items: IncidentTimelineItem[];
} {
  const now = input.now ?? new Date();
  const auditRows = [...input.auditRows].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  const items: IncidentTimelineItem[] = [];

  for (const row of auditRows.filter((audit) => !audit.success).slice(0, 5)) {
    const detectedAt = toDate(row.createdAt);
    const recovered = auditRows.some(
      (candidate) =>
        candidate.tool === row.tool &&
        candidate.success &&
        toDate(candidate.createdAt).getTime() > detectedAt.getTime(),
    );
    items.push({
      id: row.id ?? `audit-${row.tool}-${detectedAt.toISOString()}`,
      severity: surfaceForTool(row.tool) === "WhatsApp" ? "P1" : "P2",
      status: statusForRecovered(recovered),
      detectedAt,
      symptom: `${row.tool} failed: ${compactText(row.error)}`,
      affectedSurfaces: [surfaceForTool(row.tool)],
      actionsTaken: [
        "Inspect the redacted audit row.",
        "Run the focused smoke or command that covers this surface.",
      ],
      recoveryProof: recovered ? `Later successful ${row.tool} audit row found.` : "UNVERIFIED: no later successful audit row found.",
    });
  }

  for (const row of auditRows.filter((audit) => audit.success && (audit.durationMs ?? 0) >= 2_000).slice(0, 3)) {
    const detectedAt = toDate(row.createdAt);
    items.push({
      id: row.id ?? `slow-${row.tool}-${detectedAt.toISOString()}`,
      severity: (row.durationMs ?? 0) >= 5_000 ? "P2" : "P3",
      status: "watch",
      detectedAt,
      symptom: `${row.tool} was slow (${row.durationMs}ms).`,
      affectedSurfaces: [surfaceForTool(row.tool)],
      actionsTaken: ["Check provider latency, retries, and recent logs before broad changes."],
      recoveryProof: "WATCH: successful call completed, but latency target was missed.",
    });
  }

  for (const job of input.commandJobs.filter((row) => row.status === "failed" || row.status === "retrying").slice(0, 5)) {
    const detectedAt = toDate(job.updatedAt);
    items.push({
      id: job.id ?? `job-${job.source}-${detectedAt.toISOString()}`,
      severity: job.status === "failed" ? "P1" : "P2",
      status: job.status === "failed" ? "open" : "watch",
      detectedAt,
      symptom: `${job.source} command ${job.status}: ${compactText(job.error, "No error recorded")}`,
      affectedSurfaces: [job.source === "whatsapp" ? "WhatsApp commands" : "Dashboard commands"],
      actionsTaken: ["Review command job state.", "Confirm whether a retry, clarification, or user-safe failure reply was sent."],
      recoveryProof: job.completedAt ? "Completion timestamp recorded." : "UNVERIFIED: no completion timestamp recorded.",
    });
  }

  for (const heartbeat of input.heartbeats.filter((row): row is IncidentHeartbeatRow => Boolean(row))) {
    const ageMinutes = minutesSince(heartbeat.lastSeenAt, now);
    const stale = ageMinutes > 30;
    const badStatus = !["ok", "ready"].includes(heartbeat.status);
    if (!stale && !badStatus) continue;
    items.push({
      id: `heartbeat-${heartbeat.source}`,
      severity: heartbeat.source.includes("whatsapp") || heartbeat.source.includes("bot") ? "P1" : "P2",
      status: badStatus ? "open" : "watch",
      detectedAt: toDate(heartbeat.lastSeenAt),
      symptom: `${heartbeat.source} heartbeat is ${badStatus ? heartbeat.status : `${ageMinutes}m old`}.`,
      affectedSurfaces: [heartbeat.source.includes("whatsapp") ? "WhatsApp" : "Background worker"],
      actionsTaken: ["Check process health.", "Verify latest smoke proof before restart or redeploy."],
      recoveryProof: "UNVERIFIED: heartbeat is stale or not OK.",
    });
  }

  const sorted = items
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .slice(0, 8)
    .map((item) => ({
      ...item,
      affectedSurfaces: unique(item.affectedSurfaces),
      actionsTaken: unique(item.actionsTaken),
    }));

  const openCount = sorted.filter((item) => item.status === "open").length;
  const watchCount = sorted.filter((item) => item.status === "watch").length;

  return {
    status: openCount > 0 ? "action" : watchCount > 0 ? "watch" : "clear",
    items: sorted,
  };
}
