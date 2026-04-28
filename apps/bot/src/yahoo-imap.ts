// Yahoo Mail fetcher via IMAP (Yahoo doesn't support OAuth for 3rd party apps reliably).
// Requires YAHOO_EMAIL + YAHOO_APP_PASSWORD env vars.

import { ImapFlow } from "imapflow";

export interface UnreadEmail {
  source: string;
  from: string;
  subject: string;
  date: Date;
  snippet?: string;
}

export async function fetchYahooUnread(limit = 5): Promise<UnreadEmail[]> {
  const email = process.env.YAHOO_EMAIL;
  const password = process.env.YAHOO_APP_PASSWORD;
  if (!email || !password) return [];

  const client = new ImapFlow({
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const out: UnreadEmail[] = [];
    try {
      const messages = client.fetch({ seen: false }, { envelope: true, internalDate: true });
      for await (const msg of messages) {
        if (out.length >= limit) break;
        const env = msg.envelope;
        if (!env) continue;
        const from = env.from?.[0]?.address ?? "(unknown)";
        const dateValue: string | Date = msg.internalDate ?? env.date ?? new Date();
        const dateAsDate: Date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
        out.push({
          source: `Yahoo (${email})`,
          from,
          subject: env.subject ?? "(no subject)",
          date: dateAsDate,
        });
      }
    } finally {
      lock.release();
    }
    return out;
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}