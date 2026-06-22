import { getMsAccessToken, hasMsToken } from "./microsoft-auth.js";
import { logBotError } from "./safe-log.js";

export interface MsEvent {
  title: string;
  start: Date;
  end: Date;
  location?: string;
}

export interface MsUnreadEmail {
  source: string;
  from: string;
  subject: string;
  date: Date;
  snippet?: string;
}

interface GraphDateTime {
  dateTime?: string;
}

interface GraphEvent {
  subject?: string;
  start?: GraphDateTime;
  end?: GraphDateTime;
  location?: { displayName?: string };
}

interface GraphMailMessage {
  from?: { emailAddress?: { address?: string } };
  subject?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
}

async function graphGet(path: string): Promise<unknown> {
  const token = await getMsAccessToken();
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Graph request failed: ${resp.status}`);
  return resp.json();
}

async function graphPost(path: string, body: unknown): Promise<unknown> {
  const token = await getMsAccessToken();
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Graph POST failed: ${resp.status}`);
  return resp.json();
}

export interface CreateMsEventArgs {
  title: string;
  start: Date;
  durationMin: number;
  participants: string[];
  description?: string;
  timezone?: string;
}

export interface CreateMsEventResult {
  id: string;
  webLink?: string;
}

export async function createMsEvent(args: CreateMsEventArgs): Promise<CreateMsEventResult> {
  if (!hasMsToken()) {
    throw new Error("Outlook not authenticated. Run 'pnpm ms:auth' to connect.");
  }
  const end = new Date(args.start.getTime() + args.durationMin * 60 * 1000);
  const tz = args.timezone ?? "UTC";
  const body = {
    subject: args.title,
    body: args.description ? { contentType: "Text", content: args.description } : undefined,
    start: { dateTime: args.start.toISOString().replace("Z", ""), timeZone: tz },
    end: { dateTime: end.toISOString().replace("Z", ""), timeZone: tz },
    attendees: args.participants.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    })),
  };
  const data = (await graphPost("/me/events", body)) as { id?: string; webLink?: string };
  return { id: data.id ?? "", webLink: data.webLink ?? undefined };
}

export async function fetchMsEventsToday(_timezone: string): Promise<MsEvent[]> {
  if (!hasMsToken()) return [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const path = `/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=20`;
  try {
    const data = (await graphGet(path)) as { value?: GraphEvent[] };
    return (data.value ?? []).map((e) => ({
      title: e.subject ?? "(no title)",
      start: new Date(e.start?.dateTime ?? Date.now()),
      end: new Date(e.end?.dateTime ?? Date.now()),
      location: e.location?.displayName ?? undefined,
    }));
  } catch (err) {
    logBotError("[ms-graph] events fetch failed", err);
    return [];
  }
}

export interface SendMailArgs {
  to: string;
  subject: string;
  /** Plain-text body. Sent as HTML with newlines converted to <br>. */
  body: string;
}

export interface SendMailRichArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain-text body. Sent as HTML with newlines converted to <br>. */
  body: string;
  replyToInternetMessageId?: string;
}

export interface SendMailRichResult {
  /** Microsoft Graph /me/sendMail returns 202 with no body. id may be undefined. */
  messageId: string;
  webLink?: string;
}

/**
 * Rich Outlook send via /me/sendMail. Supports cc/bcc + multiple recipients.
 * Requires Mail.Send scope (granted in session 48 re-auth).
 */
export async function sendMailRich(args: SendMailRichArgs): Promise<SendMailRichResult> {
  if (!hasMsToken()) {
    throw new Error("Outlook not authenticated. Run 'pnpm ms:auth' to connect.");
  }
  const htmlBody = args.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  const toRecipients = args.to.map((address) => ({ emailAddress: { address } }));
  const ccRecipients = (args.cc ?? []).map((address) => ({ emailAddress: { address } }));
  const bccRecipients = (args.bcc ?? []).map((address) => ({ emailAddress: { address } }));
  const payload: Record<string, unknown> = {
    message: {
      subject: args.subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients,
      ccRecipients,
      bccRecipients,
    },
    saveToSentItems: true,
  };
  const token = await getMsAccessToken();
  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`Graph POST /me/sendMail failed: ${resp.status}`);
  }
  // Graph returns 202 Accepted with no body for sendMail; surface a synthetic id
  // so the caller has something stable. Web link not available pre-send.
  return { messageId: `outlook-sent-${Date.now()}` };
}

/**
 * Send an email via Microsoft Graph /me/sendMail.
 * Requires Mail.Send scope — re-run `pnpm ms:auth` after adding the scope.
 */
export async function sendMail(args: SendMailArgs): Promise<void> {
  if (!hasMsToken()) {
    throw new Error("Outlook not authenticated. Run 'pnpm ms:auth' to connect.");
  }
  const htmlBody = args.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  const payload = {
    message: {
      subject: args.subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [{ emailAddress: { address: args.to } }],
    },
    saveToSentItems: false,
  };
  const token = await getMsAccessToken();
  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  // 202 Accepted = sent; anything else is an error
  if (!resp.ok) {
    throw new Error(`Graph POST /me/sendMail failed: ${resp.status}`);
  }
}

export async function fetchMsUnread(limit = 5): Promise<MsUnreadEmail[]> {
  if (!hasMsToken()) return [];
  const path = `/me/mailFolders/inbox/messages?$filter=isRead eq false&$orderby=receivedDateTime desc&$top=${limit}&$select=from,subject,receivedDateTime,bodyPreview`;
  try {
    const data = (await graphGet(path)) as { value?: GraphMailMessage[] };
    return (data.value ?? []).map((m) => ({
      source: "Outlook",
      from: m.from?.emailAddress?.address ?? "(unknown)",
      subject: m.subject ?? "(no subject)",
      date: new Date(m.receivedDateTime ?? Date.now()),
      snippet: m.bodyPreview ?? undefined,
    }));
  } catch (err) {
    logBotError("[ms-graph] mail fetch failed", err);
    return [];
  }
}
