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

import { pushNotify, type NotifyOpts } from "@nitsyclaw/shared/notify";
import { hasMsToken } from "./microsoft-auth.js";
import { sendMail } from "./microsoft-graph.js";

export async function notifyAll(text: string, opts: NotifyOpts = {}): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;
  await Promise.all([
    pushNotify(text, opts).catch(() => {}),
    sendMsEmailNotify(text, opts),
  ]);
}

async function sendMsEmailNotify(text: string, opts: NotifyOpts): Promise<void> {
  const to = process.env.NOTIFY_EMAIL;
  if (!to || !hasMsToken()) return;
  const subject = opts.title ?? "NitsyClaw";
  try {
    await sendMail({ to, subject, body: text });
  } catch (e) {
    console.error("[notify/ms-mail] failed", e);
  }
}
