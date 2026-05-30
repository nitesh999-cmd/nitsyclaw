import type { FeatureRequest } from "../db/schema.js";
import { rankPriorityItems } from "./23-memory-ops.js";

type FeatureRow = Pick<
  FeatureRequest,
  | "id"
  | "description"
  | "type"
  | "severity"
  | "size"
  | "source"
  | "createdAt"
  | "completedAt"
  | "implementationNotes"
>;

export interface FeatureQueueItem {
  id: string;
  shortId: string;
  type: FeatureRequest["type"];
  severity: FeatureRequest["severity"];
  size: FeatureRequest["size"];
  description: string;
  source: FeatureRequest["source"];
  category: string;
  setupHeavy: boolean;
  createdAt: Date;
  priority: "P0" | "P1" | "P2" | "P3";
  priorityScore: number;
}

export interface FeatureQueueBatch {
  key: string;
  label: string;
  count: number;
  examples: FeatureQueueItem[];
}

export interface FeatureQueueStatusSummary {
  pendingCount: number;
  topPending: FeatureQueueItem[];
  recentCompleted: FeatureQueueItem[];
  quickWins: FeatureQueueItem[];
  setupHeavy: FeatureQueueItem[];
  recommendedNext: FeatureQueueItem | null;
  batches: FeatureQueueBatch[];
}

export interface FeatureQueueMirrorItem {
  id: string;
  shortId: string;
  type: FeatureRequest["type"];
  severity: FeatureRequest["severity"];
  size: FeatureRequest["size"];
  source: FeatureRequest["source"];
  category: string;
  setupHeavy: boolean;
  description: string;
  createdAt: string;
}

export interface FeatureQueueMirror {
  pendingCount: number;
  recommendedNext: FeatureQueueMirrorItem | null;
  batches: Array<Omit<FeatureQueueBatch, "examples"> & { examples: FeatureQueueMirrorItem[] }>;
  rows: FeatureQueueMirrorItem[];
  safety: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  email: "Email and inbox",
  files: "Drive and files",
  photos: "Google Photos",
  phone_sms: "Phone and SMS",
  banking: "Banking and expenses",
  music: "Spotify and music",
  birthdays: "Birthdays and contacts",
  social_video: "Social video",
  ui: "Dashboard and UI",
  reliability: "Reliability and self-healing",
  other: "Other",
};

const SETUP_HEAVY_CATEGORIES = new Set([
  "email",
  "files",
  "photos",
  "phone_sms",
  "banking",
  "music",
  "birthdays",
  "social_video",
]);

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]?){8,}\d/g;

export function summarizeFeatureQueueStatus(args: {
  pending: FeatureRow[];
  completed?: FeatureRow[];
  limit?: number;
  now?: Date;
}): FeatureQueueStatusSummary {
  const limit = args.limit ?? 5;
  const now = args.now ?? new Date();
  const pending = prioritizeFeatureQueue(args.pending.map((row) => toFeatureQueueItem(row, now)));
  const recentCompleted = (args.completed ?? []).map((row) => toFeatureQueueItem(row, now));
  const quickWins = pending
    .filter((item) => item.size === "S" && !item.setupHeavy)
    .slice(0, limit);
  const setupHeavy = pending
    .filter((item) => item.setupHeavy)
    .slice(0, limit);
  const recommendedNext = pickRecommendedNext(pending);

  return {
    pendingCount: pending.length,
    topPending: pending.slice(0, limit),
    recentCompleted,
    quickWins,
    setupHeavy,
    recommendedNext,
    batches: buildBatches(pending, limit),
  };
}

export function buildFeatureQueueMirror(args: { pending: FeatureRow[]; limit?: number }): FeatureQueueMirror {
  const limit = args.limit ?? 50;
  const summary = summarizeFeatureQueueStatus({ pending: args.pending, limit: Math.min(limit, 10) });
  const items = args.pending.map((row) => toFeatureQueueItem(row));
  const mirrorItems = items.map((item) => toMirrorItem(item, args.pending));
  const rows = mirrorItems.slice(0, limit);
  const rowById = new Map(mirrorItems.map((row) => [row.id, row]));
  return {
    pendingCount: items.length,
    recommendedNext: summary.recommendedNext ? (rowById.get(summary.recommendedNext.id) ?? null) : null,
    batches: summary.batches.map((batch) => ({
      ...batch,
      examples: batch.examples
        .map((item) => rowById.get(item.id))
        .filter((item): item is FeatureQueueMirrorItem => Boolean(item)),
    })),
    rows,
    safety: "Read-only queue mirror. It omits requester hashes, internal keys, raw notes, secrets, and provider tokens.",
  };
}

function redactQueueDescription(text: string): string {
  return truncate(text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]"), 240);
}

export function formatFeatureQueueStatusForWhatsApp(summary: FeatureQueueStatusSummary): string {
  if (summary.pendingCount === 0) {
    const shipped = summary.recentCompleted.slice(0, 2).map(formatCompactItem);
    return shipped.length
      ? `Feature queue is clear.\nRecently shipped:\n${shipped.join("\n")}`
      : "Feature queue is clear. No pending feature or bug items.";
  }

  const lines = [
    `Feature queue: ${summary.pendingCount} pending`,
    "State: checked live queue. Setup-heavy items are queued, not connected.",
    summary.recommendedNext
      ? `Best safe next: ${formatInlineItem(summary.recommendedNext)}`
      : undefined,
    summary.quickWins.length > 1
      ? `Other quick wins: ${summary.quickWins.slice(1, 3).map(formatInlineItem).join(" | ")}`
      : undefined,
    summary.setupHeavy.length
      ? `Needs setup before live action: ${summary.setupHeavy.length} item(s) across ${summarizeSetupCategories(summary.setupHeavy)}.`
      : undefined,
    summary.batches.length
      ? `Batches: ${summary.batches.slice(0, 4).map((batch) => `${batch.label} ${batch.count}`).join(" | ")}`
      : undefined,
    "Next: status | local status | add feature: <idea>",
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function toFeatureQueueItem(row: FeatureRow, now = new Date()): FeatureQueueItem {
  const category = classifyFeature(row.description);
  const createdAt = row.createdAt ?? new Date(0);
  const prioritySignal = scoreFeatureQueueItem({
    type: row.type,
    severity: row.severity,
    size: row.size,
    category,
    setupHeavy: SETUP_HEAVY_CATEGORIES.has(category),
    createdAt,
    now,
  });

  return {
    id: row.id,
    shortId: row.id.slice(0, 8),
    type: row.type,
    severity: row.severity,
    size: row.size,
    description: row.description,
    source: row.source,
    category,
    setupHeavy: SETUP_HEAVY_CATEGORIES.has(category),
    createdAt,
    priority: prioritySignal.priority,
    priorityScore: prioritySignal.score,
  };
}

function toMirrorItem(item: FeatureQueueItem, rows: FeatureRow[]): FeatureQueueMirrorItem {
  const original = rows.find((row) => row.id === item.id);
  return {
    id: item.id,
    shortId: item.shortId,
    type: item.type,
    severity: item.severity,
    size: item.size,
    source: item.source,
    category: item.category,
    setupHeavy: item.setupHeavy,
    description: redactQueueDescription(item.description),
    createdAt: (original?.createdAt ?? new Date(0)).toISOString(),
  };
}

function classifyFeature(description: string): string {
  const text = description.toLowerCase();
  if (/\b(gmail|outlook|email|inbox|mailbox)\b/.test(text)) return "email";
  if (/\b(drive|onedrive|file|files|document|documents)\b/.test(text)) return "files";
  if (/\b(google photos|photo|photos|album|albums)\b/.test(text)) return "photos";
  if (/\b(phone|sms|call|calls)\b/.test(text)) return "phone_sms";
  if (/\b(bank|banking|expense|expenses|card transaction|transactions)\b/.test(text)) return "banking";
  if (/\b(spotify|playlist|music|song|songs)\b/.test(text)) return "music";
  if (/\b(birthday|birthdays|facebook birthday|contacts?)\b/.test(text)) return "birthdays";
  if (/\b(instagram|tiktok|youtube|reel|social video|video analysis)\b/.test(text)) return "social_video";
  if (/\b(ui|dashboard|mobile|screen|page|button|navigation)\b/.test(text)) return "ui";
  if (/\b(reliability|self-healing|watchdog|heartbeat|loop|crash|stale)\b/.test(text)) return "reliability";
  return "other";
}

function pickRecommendedNext(pending: FeatureQueueItem[]): FeatureQueueItem | null {
  const criticalBug = pending.find((item) => item.type === "bug" && (item.severity === "P0" || item.severity === "P1"));
  if (criticalBug) return criticalBug;

  const buildable = pending.filter((item) => !item.setupHeavy);
  if (buildable.length > 0) return buildable[0] ?? null;

  return pending[0] ?? null;
}

function prioritizeFeatureQueue(pending: FeatureQueueItem[]): FeatureQueueItem[] {
  return [...pending].sort((a, b) => {
    if (a.setupHeavy !== b.setupHeavy) return a.setupHeavy ? 1 : -1;
    return b.priorityScore - a.priorityScore || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function scoreFeatureQueueItem(args: {
  type: FeatureRequest["type"];
  severity: FeatureRequest["severity"];
  size: FeatureRequest["size"];
  category: string;
  setupHeavy: boolean;
  createdAt: Date;
  now: Date;
}): { score: number; priority: FeatureQueueItem["priority"] } {
  const ageDays = Math.max(0, Math.floor((args.now.getTime() - args.createdAt.getTime()) / 86_400_000));
  const impact =
    args.type === "bug" || args.severity === "P0" || args.severity === "P1" || args.category === "reliability"
      ? "high"
      : args.category === "ui" || args.size === "S"
        ? "medium"
        : "low";
  const risk =
    args.type === "bug" || args.category === "reliability"
      ? "high"
      : args.setupHeavy
        ? "medium"
        : "low";
  const dueInDays =
    args.type === "bug" && args.severity === "P0"
      ? 0
      : args.type === "bug" && args.severity === "P1"
        ? 1
        : args.category === "reliability"
          ? 2
          : args.size === "S" && !args.setupHeavy
            ? 7
            : args.setupHeavy
              ? 30
              : 14;

  const [ranked] = rankPriorityItems({
    items: [{ title: "feature queue item", ageDays, dueInDays, impact, risk }],
  }).ranked;

  return {
    score: ranked?.score ?? 0,
    priority: ranked?.priority ?? "P3",
  };
}

function buildBatches(pending: FeatureQueueItem[], limit: number): FeatureQueueBatch[] {
  const grouped = new Map<string, FeatureQueueItem[]>();
  for (const item of pending) {
    const current = grouped.get(item.category) ?? [];
    current.push(item);
    grouped.set(item.category, current);
  }

  return [...grouped.entries()]
    .map(([key, items]) => ({
      key,
      label: getCategoryLabel(key),
      count: items.length,
      examples: items.slice(0, limit),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function getCategoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? "Other";
}

function formatCompactItem(item: FeatureQueueItem): string {
  const risk = item.type === "bug" ? `bug ${item.severity ?? "P2"}` : item.size;
  return `- ${item.shortId} ${risk}: ${truncate(item.description, 92)}`;
}

function formatInlineItem(item: FeatureQueueItem): string {
  const risk = item.type === "bug" ? `bug ${item.severity ?? "P2"}` : item.size;
  return `${item.shortId} ${risk}: ${truncate(item.description, 58)}`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function summarizeSetupCategories(items: FeatureQueueItem[]): string {
  const categories = [...new Set(items.map((item) => item.category))]
    .slice(0, 4)
    .map(getCategoryLabel);
  const extra = new Set(items.map((item) => item.category)).size - categories.length;
  return extra > 0 ? `${categories.join(", ")}, +${extra} more` : categories.join(", ");
}
