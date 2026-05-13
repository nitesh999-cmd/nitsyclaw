// Local daily build agent (Option B from mind.md L36).
// CCR cloud sandbox permanently blocks outbound to Supabase + ntfy, so this
// runs inside the always-on bot process which has full network access.
// Fires at 12:00 UTC via scheduler.ts. Queries pending feature_requests and
// notifies Nitesh via WhatsApp + ntfy. Implementation is handled through the
// local operator workflow, not by telling the user to manually open another app.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { claimSystemNotification, listPendingFeatureRequests, insertMessage } from "@nitsyclaw/shared/db";
import type { FeatureRequest } from "@nitsyclaw/shared/db";
import { encryptForStorage, hashPhone } from "@nitsyclaw/shared/utils";
import { pushNotify } from "@nitsyclaw/shared/notify";
import { createHash } from "node:crypto";
import { logBotError } from "./safe-log.js";

const FEATURE_NOTIFICATION_SOURCE = "build-agent-feature-notify";
const FEATURE_NTFY_RATE_LIMIT_SOURCE = "build-agent-feature-ntfy-rate-limit";
const DEFAULT_FEATURE_NOTIFY_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "https://nitsyclaw.vercel.app";
const localNtfyPushes = new Map<string, number>();

export async function runDailyBuildAgent(
  deps: AgentDeps,
  ownerPhone: string,
): Promise<void> {
  console.log("[build-agent] querying pending feature_requests...");

  const pending = await listPendingFeatureRequests(deps.db);

  if (pending.length === 0) {
    console.log("[build-agent] no pending features — done");
    return;
  }

  const now = deps.now();
  const fingerprint = pendingFeatureQueueFingerprint(pending);
  const claimed = await claimSystemNotification(deps.db, {
    source: FEATURE_NOTIFICATION_SOURCE,
    fingerprint,
    now,
    cooldownMs: featureNotifyCooldownMs(),
    metadata: {
      pendingCount: pending.length,
    },
  }).catch((e) => {
    logBotError("[build-agent] notification dedupe failed", e, {
      pendingCount: pending.length,
    });
    return false;
  });

  if (!claimed) {
    console.log(`[build-agent] suppressed duplicate pending-feature notification (${pending.length} pending)`);
    return;
  }

  const lines = pending
    .map((f, i) => {
      const num = i + 1;
      const shortId = f.id.slice(0, 8);
      return `${num}. [${f.size}] ${f.description}\n   ID: ${shortId} | via: ${f.source}`;
    })
    .join("\n\n");

  const body =
    `\u{1F527} Build agent: ${pending.length} pending feature(s):\n\n` +
    lines +
    `\n\nNext: these are queued for the local operator workflow. I will not claim a feature is shipped until it is committed, tested, and marked done.`;

  // WhatsApp is the normal queue surface. ntfy is reserved for critical items
  // or as a fallback when WhatsApp cannot receive the queue summary.
  let whatsappSummarySent = false;
  try {
    await deps.whatsapp.send({ to: ownerPhone, body });
    const enc = encryptForStorage(body);
    await insertMessage(deps.db, {
      direction: "out",
      surface: "whatsapp",
      fromNumber: hashPhone(ownerPhone),
      body: enc,
    });
    whatsappSummarySent = true;
  } catch (e) {
    logBotError("[build-agent] failed to send WhatsApp notification", e, {
      pendingCount: pending.length,
    });
  }

  const criticalCount = countCriticalPendingItems(pending);
  if (!whatsappSummarySent) {
    await sendBuildAgentPushOnce(deps, {
      fingerprint: "pending-feature-summary-whatsapp-failed",
      now,
      metadata: { pendingCount: pending.length, queueFingerprint: fingerprint },
      message: `Build queue summary could not be sent on WhatsApp. ${pending.length} pending item(s).`,
      title: "NitsyClaw: WhatsApp queue failed",
      priority: "high",
      tags: ["warning"],
    });
  } else if (criticalCount > 0) {
    await sendBuildAgentPushOnce(deps, {
      fingerprint: `critical-pending-feature-summary:${fingerprint}`,
      now,
      metadata: { pendingCount: pending.length, criticalCount, queueFingerprint: fingerprint },
      message: `${criticalCount} critical pending item(s). Details sent on WhatsApp.`,
      title: "NitsyClaw: critical queue item",
      priority: "high",
      tags: ["warning"],
    });
  }

  console.log(`[build-agent] notified Nitesh about ${pending.length} pending feature(s)`);
}

export function pendingFeatureQueueFingerprint(pending: Pick<FeatureRequest, "id" | "createdAt" | "status">[]): string {
  const raw = pending
    .map((feature) => {
      const createdAt = feature.createdAt instanceof Date
        ? feature.createdAt.toISOString()
        : String(feature.createdAt ?? "");
      return `${feature.id}:${feature.status}:${createdAt}`;
    })
    .sort()
    .join("|");
  return createHash("sha256").update(raw).digest("hex");
}

export function resetBuildAgentNotificationGuardsForTest(): void {
  localNtfyPushes.clear();
}

function featureNotifyCooldownMs(): number {
  const hours = Number(process.env.BUILD_AGENT_NOTIFY_COOLDOWN_HOURS);
  if (Number.isFinite(hours) && hours >= 1 && hours <= 72) {
    return hours * 60 * 60 * 1000;
  }
  return DEFAULT_FEATURE_NOTIFY_COOLDOWN_MS;
}

function countCriticalPendingItems(pending: Pick<FeatureRequest, "type" | "severity">[]): number {
  return pending.filter((feature) =>
    feature.type === "bug" && (feature.severity === "P0" || feature.severity === "P1")
  ).length;
}

async function sendBuildAgentPushOnce(
  deps: AgentDeps,
  input: {
    fingerprint: string;
    now: Date;
    metadata: Record<string, unknown>;
    message: string;
    title: string;
    priority: "default" | "high" | "urgent";
    tags: string[];
  },
): Promise<void> {
  const notifyClaimed = await claimSystemNotification(deps.db, {
    source: FEATURE_NTFY_RATE_LIMIT_SOURCE,
    fingerprint: input.fingerprint,
    now: input.now,
    cooldownMs: featureNotifyCooldownMs(),
    metadata: input.metadata,
  }).catch((e) => {
    logBotError("[build-agent] ntfy rate-limit claim failed", e, input.metadata);
    return false;
  });

  if (!notifyClaimed || !claimLocalNtfyPush(input.fingerprint, input.now, featureNotifyCooldownMs())) {
    console.log(`[build-agent] suppressed duplicate ntfy push (${input.fingerprint})`);
    return;
  }

  await pushNotify(input.message, {
    title: input.title,
    tags: input.tags,
    priority: input.priority,
    click: DASHBOARD_URL,
  }).catch(() => {});
}

function claimLocalNtfyPush(fingerprint: string, now: Date, cooldownMs: number): boolean {
  const previous = localNtfyPushes.get(fingerprint);
  if (previous !== undefined && now.getTime() - previous < cooldownMs) {
    return false;
  }
  localNtfyPushes.set(fingerprint, now.getTime());
  return true;
}
