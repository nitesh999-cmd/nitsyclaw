// Local daily build agent (Option B from mind.md L36).
// CCR cloud sandbox permanently blocks outbound to Supabase + ntfy, so this
// runs inside the always-on bot process which has full network access.
// Fires at 12:00 UTC via scheduler.ts. Queries pending feature_requests and
// notifies Nitesh via WhatsApp + ntfy. Auto-implementation deferred: for now
// the notification tells him to open Claude Code and type *nwp to process them.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { listPendingFeatureRequests, insertMessage } from "@nitsyclaw/shared/db";
import { encryptString, hashPhone } from "@nitsyclaw/shared/utils";
import { pushNotify } from "@nitsyclaw/shared/notify";

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
    `\n\nTo implement, open Claude Code in the NitsyClaw repo and type \`*nwp\` or trigger the daily build agent manually.`;

  // ntfy push (phone + PC notification)
  await pushNotify(
    `${pending.length} pending feature(s). Details on WhatsApp.`,
    {
      title: "NitsyClaw: features pending",
      tags: ["gear"],
      priority: "default",
      click: "https://nitsyclaw.vercel.app",
    },
  ).catch(() => {});

  // WhatsApp self-message so Nitesh sees the list on his phone
  try {
    await deps.whatsapp.send({ to: ownerPhone, body });
    const enc = process.env.ENCRYPTION_KEY ? encryptString(body) : body;
    await insertMessage(deps.db, {
      direction: "out",
      surface: "whatsapp",
      fromNumber: hashPhone(ownerPhone),
      body: enc,
    });
  } catch (e) {
    console.error("[build-agent] failed to send WhatsApp notification", e);
  }

  console.log(`[build-agent] notified Nitesh about ${pending.length} pending feature(s)`);
}
