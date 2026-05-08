// Local daily build agent (Option B from mind.md L36).
// CCR cloud sandbox permanently blocks outbound to Supabase + ntfy, so this
// runs inside the always-on bot process which has full network access.
// Fires at 12:00 UTC via scheduler.ts. Queries pending feature_requests and
// notifies Nitesh via WhatsApp + ntfy. Implementation is handled through the
// local operator workflow, not by telling the user to manually open another app.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { listPendingFeatureRequests, insertMessage } from "@nitsyclaw/shared/db";
import { encryptForStorage, hashPhone } from "@nitsyclaw/shared/utils";
import { pushNotify } from "@nitsyclaw/shared/notify";
import { logBotError } from "./safe-log.js";

export async function runDailyBuildAgent(
  deps: AgentDeps,
  ownerPhone: string,
): Promise<void> {
  console.log("[build-agent] querying pending feature_requests...");

  const pending = await listPendingFeatureRequests(deps.db);

  if (pending.length === 0) {
    await pushNotify("No pending feature requests today.", {
      title: "Daily build agent: idle",
      tags: ["white_check_mark"],
    }).catch(() => {});
    console.log("[build-agent] no pending features — done");
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
