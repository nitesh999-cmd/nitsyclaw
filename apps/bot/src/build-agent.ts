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
const DEFAULT_FEATURE_NOTIFY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

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

  // ntfy push (phone + PC notification)
  await pushNotify(
    `${pending.length} pending feature(s). Details on WhatsApp.`,
    {
      title: "NitsyClaw: features pending",
      tags: ["gear"],
      priority: "default",
      click: process.env.DASHBOARD_URL ?? "https://nitsyclaw.vercel.app",
    },
  ).catch(() => {});

  // WhatsApp self-message so Nitesh sees the list on his phone
  try {
    await deps.whatsapp.send({ to: ownerPhone, body });
    const enc = encryptForStorage(body);
    await insertMessage(deps.db, {
      direction: "out",
      surface: "whatsapp",
      fromNumber: hashPhone(ownerPhone),
      body: enc,
    });
  } catch (e) {
    logBotError("[build-agent] failed to send WhatsApp notification", e, {
      pendingCount: pending.length,
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

function featureNotifyCooldownMs(): number {
  const hours = Number(process.env.BUILD_AGENT_NOTIFY_COOLDOWN_HOURS);
  if (Number.isFinite(hours) && hours >= 1 && hours <= 72) {
    return hours * 60 * 60 * 1000;
  }
  return DEFAULT_FEATURE_NOTIFY_COOLDOWN_MS;
}
