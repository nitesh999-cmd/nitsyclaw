/**
 * notifyAll — fire every available notification channel in parallel.
 *
 * Channels:
 *   1. ntfy (push to phone/desktop via ntfy.sh)         — always attempted
 *   2. Windows toast                                      — always attempted
 *   3. Microsoft 365 email via /me/sendMail              — only if NOTIFY_EMAIL
 *      is set AND an MS token exists (i.e. `pnpm ms:auth` has been run with
 *      the Mail.Send scope).
 *
 * All channels are best-effort. Failure of any one is silently absorbed
 * so it never blocks a bot reply.
 */

import { pushNotify, type NotifyChannelResult, type NotifyOpts } from "@nitsyclaw/shared/notify";
import { upsertSystemHeartbeat, type DB } from "@nitsyclaw/shared/db";
import { hasMsToken } from "./microsoft-auth.js";
import { sendMail } from "./microsoft-graph.js";
import { logBotError } from "./safe-log.js";

// All notify channels are best-effort and every failure was previously
// swallowed with no counter or alert — if ntfy.sh, the Windows toast, and
// MS mail all silently break at once (e.g. NTFY_TOPIC typo'd after a
// .env.local edit), there was no way to find out short of noticing the
// absence of a push that never should have been silent in the first place.
// This in-memory counter + heartbeat gives that failure a visible trail
// (surfaced in the nightly WhatsApp health report) without building out
// full alerting infra.
let consecutiveAllChannelFailures = 0;

export async function notifyAll(text: string, opts: NotifyOpts = {}, db?: DB): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;
  const [pushResult, mailResult] = await Promise.all([
    pushNotify(text, opts).catch((): { ntfy: NotifyChannelResult; toast: NotifyChannelResult } => ({
      ntfy: "failed",
      toast: "failed",
    })),
    sendMsEmailNotify(text, opts),
  ]);

  const results = [pushResult.ntfy, pushResult.toast, mailResult];
  const attempted = results.filter((r) => r !== "skipped");
  const allFailed = attempted.length > 0 && attempted.every((r) => r === "failed");
  consecutiveAllChannelFailures = allFailed ? consecutiveAllChannelFailures + 1 : 0;

  if (!db) return;
  await upsertSystemHeartbeat(db, {
    source: "notify-channels",
    status: allFailed ? "error" : "ok",
    lastSeenAt: new Date(),
    metadata: {
      ntfy: pushResult.ntfy,
      toast: pushResult.toast,
      msMail: mailResult,
      consecutiveAllChannelFailures,
    },
  }).catch((e) => logBotError("[notify-all] heartbeat write failed", e));
}

async function sendMsEmailNotify(text: string, opts: NotifyOpts): Promise<NotifyChannelResult> {
  const to = process.env.NOTIFY_EMAIL;
  if (!to || !hasMsToken()) return "skipped";
  const subject = opts.title ?? "NitsyClaw";
  try {
    await sendMail({ to, subject, body: text });
    return "sent";
  } catch (e) {
    logBotError("[notify/ms-mail] failed", e);
    return "failed";
  }
}
