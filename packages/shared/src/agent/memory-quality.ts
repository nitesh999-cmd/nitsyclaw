export type MemoryQualityCategory =
  | "fact"
  | "preference"
  | "temporary_context"
  | "old_snapshot"
  | "guess"
  | "sensitive";

export type MemoryQualityAction = "keep" | "review" | "expire";

export interface MemoryQualityAssessment {
  category: MemoryQualityCategory;
  confidence: "explicit" | "inferred" | "uncertain";
  action: MemoryQualityAction;
  reviewAfterDays: number | null;
  reasons: string[];
  tags: string[];
}

const GUESS_RE = /\b(maybe|probably|i think|guess|not sure|could be|seems like|sounds like)\b/i;
const OLD_SNAPSHOT_RE = /\b(as of|at the moment|currently|right now|today|yesterday|last week|last month|screenshot|snapshot)\b/i;
const TEMPORARY_RE = /\b(travelling|traveling|visiting|in\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:for|until|this week|today|tomorrow)|until\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|i say|back home))\b/i;
const PREFERENCE_RE = /\b(prefer|always reply|reply in|default currency|currency|timezone|call me|language|home location|use .+ by default)\b/i;
const SENSITIVE_RE = /\b(passport|licen[cs]e|password|secret|token|bank|card|medicare|tax file|tfn|address|medical|health|child|children|birthday)\b/i;

export function assessMemoryQuality(content: string, tags: string[] = []): MemoryQualityAssessment {
  const text = content.trim();
  const reasons: string[] = [];
  let category: MemoryQualityCategory = "fact";
  let confidence: MemoryQualityAssessment["confidence"] = "explicit";
  let action: MemoryQualityAction = "keep";
  let reviewAfterDays: number | null = null;

  if (SENSITIVE_RE.test(text)) {
    category = "sensitive";
    action = "review";
    reviewAfterDays = 30;
    reasons.push("Sensitive personal data should stay visible for review.");
  }

  if (PREFERENCE_RE.test(text)) {
    category = "preference";
    reasons.push("Looks like a stable user preference.");
  }

  if (TEMPORARY_RE.test(text)) {
    category = "temporary_context";
    action = "expire";
    reviewAfterDays = 7;
    reasons.push("Looks temporary or travel-related, so it should not become permanent truth.");
  }

  if (OLD_SNAPSHOT_RE.test(text)) {
    category = category === "fact" ? "old_snapshot" : category;
    action = action === "keep" ? "review" : action;
    reviewAfterDays = reviewAfterDays ?? 14;
    reasons.push("Looks time-bound, so it should be reviewed before reuse.");
  }

  if (GUESS_RE.test(text)) {
    category = "guess";
    confidence = "uncertain";
    action = "review";
    reviewAfterDays = reviewAfterDays ?? 7;
    reasons.push("Contains uncertain language.");
  }

  if (tags.some((tag) => tag === "temporary" || tag === "travel")) {
    category = "temporary_context";
    action = "expire";
    reviewAfterDays = reviewAfterDays ?? 7;
    reasons.push("Tagged as temporary/travel context.");
  }

  const qualityTags = [
    `quality:${category}`,
    `confidence:${confidence}`,
    action === "keep" ? "memory:stable" : `memory:${action}`,
    reviewAfterDays ? `review:${reviewAfterDays}d` : undefined,
  ].filter((tag): tag is string => Boolean(tag));

  return {
    category,
    confidence,
    action,
    reviewAfterDays,
    reasons: reasons.length ? reasons : ["Useful stable fact or note."],
    tags: qualityTags,
  };
}

export function mergeMemoryQualityTags(content: string, tags: string[] = []): string[] {
  const assessment = assessMemoryQuality(content, tags);
  const cleaned = tags.filter((tag) => !/^(quality:|confidence:|memory:|review:\d+d$)/.test(tag));
  return Array.from(new Set([...cleaned, ...assessment.tags]));
}

export function formatMemoryQualityLabel(content: string, tags: string[] = []): string {
  const assessment = assessMemoryQuality(content, tags);
  const action =
    assessment.action === "keep"
      ? "stable"
      : assessment.action === "review"
        ? "review"
        : "expires/review";
  return `${assessment.category.replace(/_/g, " ")} | ${assessment.confidence} | ${action}`;
}
