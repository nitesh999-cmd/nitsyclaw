export type OperatorJobStatus = "pending" | "in_progress" | "done" | "rejected";
export type OperatorJobType = "feature" | "bug";
export type OperatorJobSeverity = "P0" | "P1" | "P2" | "P3" | null;
export type OperatorJobSize = "S" | "M" | "L";

export interface OperatorQueueJob {
  id: string;
  description: string;
  status: OperatorJobStatus;
  type: OperatorJobType;
  severity: OperatorJobSeverity;
  size: OperatorJobSize;
  createdAt: Date;
}

export interface OperatorRunPlan {
  jobId: string;
  title: string;
  decision: "claim" | "reject";
  nextStatus: "in_progress" | "rejected";
  commands: string[];
  note: string;
  rejectionReason?: string;
}

const SEVERITY_RANK: Record<Exclude<OperatorJobSeverity, null>, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const UNSAFE_PATTERNS = [
  /\bdisable\s+(?:all\s+)?tests?\b/i,
  /\bskip\s+(?:all\s+)?tests?\b/i,
  /\bdrop\s+table\b/i,
  /\bdelete\s+all\b/i,
  /\bremove\s+auth\b/i,
  /\bturn\s+off\s+auth\b/i,
  /\bprint\s+all\s+secrets?\b/i,
  /\bdump\s+(?:all\s+)?env\b/i,
  /\bcommit\s+\.env\b/i,
  /\bleak\s+secrets?\b/i,
];

export function selectNextOperatorJob(jobs: OperatorQueueJob[]): OperatorQueueJob | null {
  const pending = jobs.filter((job) => job.status === "pending");
  pending.sort((a, b) => {
    const severity = severityRank(a.severity) - severityRank(b.severity);
    if (severity !== 0) return severity;
    const type = typeRank(a.type) - typeRank(b.type);
    if (type !== 0) return type;
    const createdAt = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdAt !== 0) return createdAt;
    return a.id.localeCompare(b.id);
  });
  return pending[0] ?? null;
}

export function buildOperatorRunPlan(job: OperatorQueueJob, now = new Date()): OperatorRunPlan {
  const title = compactTitle(job.description);
  const unsafeReason = unsafeReasonFor(job.description);
  if (unsafeReason) {
    return {
      jobId: job.id,
      title,
      decision: "reject",
      nextStatus: "rejected",
      commands: [],
      note: `Operator runner rejected ${job.id} at ${now.toISOString()}. Reason: ${unsafeReason}`,
      rejectionReason: `Rejected by operator runner: unsafe request (${unsafeReason}).`,
    };
  }

  const commands = [
    "pnpm lint",
    "pnpm -r typecheck",
    "pnpm build",
    "pnpm test:coverage",
    "pnpm test:e2e",
  ];

  return {
    jobId: job.id,
    title,
    decision: "claim",
    nextStatus: "in_progress",
    commands,
    note: `Operator runner claimed ${job.id} at ${now.toISOString()}. Verification gate: ${commands.join(" && ")}.`,
  };
}

export function formatOperatorRunReport(plan: OperatorRunPlan): string {
  const commandText = plan.commands.length ? plan.commands.join(" | ") : "no commands";
  const reason = plan.rejectionReason ? ` reason=${truncate(plan.rejectionReason, 140)}` : "";
  return [
    `job=${plan.jobId}`,
    `decision=${plan.decision}`,
    `next=${plan.nextStatus}`,
    `title=${truncate(plan.title, 140)}`,
    `commands=${commandText}`,
    `note=${truncate(plan.note, 220)}`,
    reason.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

function severityRank(severity: OperatorJobSeverity): number {
  return severity ? SEVERITY_RANK[severity] : 4;
}

function typeRank(type: OperatorJobType): number {
  return type === "bug" ? 0 : 1;
}

function unsafeReasonFor(description: string): string | null {
  const pattern = UNSAFE_PATTERNS.find((candidate) => candidate.test(description));
  return pattern ? "unsafe destructive, secret, auth, or test-bypass instruction" : null;
}

function compactTitle(description: string): string {
  const cleaned = description.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled operator job";
  const colon = cleaned.indexOf(":");
  const title = colon > 0 && colon < 120 ? cleaned.slice(0, colon) : cleaned;
  return truncate(title, 160);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

