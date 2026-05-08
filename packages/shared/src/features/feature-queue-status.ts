import type { FeatureRequest } from "../db/schema.js";

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

export function summarizeFeatureQueueStatus(args: {
  pending: FeatureRow[];
  completed?: FeatureRow[];
  limit?: number;
}): FeatureQueueStatusSummary {
  const limit = args.limit ?? 5;
  const pending = args.pending.map(toFeatureQueueItem);
  const recentCompleted = (args.completed ?? []).map(toFeatureQueueItem);
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

export function formatFeatureQueueStatusForWhatsApp(summary: FeatureQueueStatusSummary): string {
  if (summary.pendingCount === 0) {
    const shipped = summary.recentCompleted.slice(0, 3).map(formatCompactItem);
    return shipped.length
      ? `Feature queue is clear.\nRecently shipped:\n${shipped.join("\n")}`
      : "Feature queue is clear. No pending feature or bug items.";
  }

  const lines = [
    `Feature queue: ${summary.pendingCount} pending.`,
    summary.recentCompleted.length
      ? `Recently shipped:\n${summary.recentCompleted.slice(0, 3).map(formatCompactItem).join("\n")}`
      : "Recently shipped: none found in the latest completed rows.",
    summary.recommendedNext
      ? `Best next safe build:\n${formatCompactItem(summary.recommendedNext)}`
      : undefined,
    summary.quickWins.length
      ? `Quick code-only wins:\n${summary.quickWins.slice(0, 3).map(formatCompactItem).join("\n")}`
      : undefined,
    summary.setupHeavy.length
      ? `Setup-heavy items waiting on provider access/OAuth:\n${summary.setupHeavy.slice(0, 4).map(formatCompactItem).join("\n")}`
      : undefined,
    summary.batches.length
      ? `Big batches:\n${summary.batches.slice(0, 5).map((batch) => `- ${batch.label}: ${batch.count}`).join("\n")}`
      : undefined,
    `Top pending:\n${summary.topPending.slice(0, 5).map(formatCompactItem).join("\n")}`,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n\n");
}

function toFeatureQueueItem(row: FeatureRow): FeatureQueueItem {
  const category = classifyFeature(row.description);
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
  const codeOnlySmall = pending.find((item) => item.size === "S" && !item.setupHeavy);
  if (codeOnlySmall) return codeOnlySmall;
  const reliability = pending.find((item) => item.category === "reliability");
  if (reliability) return reliability;
  const ui = pending.find((item) => item.category === "ui" && item.size !== "L");
  if (ui) return ui;
  return pending[0] ?? null;
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

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}
