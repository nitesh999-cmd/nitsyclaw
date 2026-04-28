import { getMsAccessToken, hasMsToken } from "./microsoft-auth.js";

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

async function graphGet(path: string): Promise<unknown> {
  const token = await getMsAccessToken();
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Graph ${path} failed: ${resp.status} ${await resp.text()}`);
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
  if (!resp.ok) throw new Error(`Graph POST ${path} failed: ${resp.status} ${await resp.text()}`);
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

export async function fetchMsEventsToday(timezone: string): Promise<MsEvent[]> {
  if (!hasMsToken()) return [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const path = `/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=20`;
  try {
    const data = (await graphGet(path)) as { value: any[] };
    return (data.value ?? []).map((e) => ({
      title: e.subject ?? "(no title)",
      start: new Date(e.start?.dateTime ?? Date.now()),
      end: new Date(e.end?.dateTime ?? Date.now()),
      location: e.location?.displayName ?? undefined,
    }));
  } catch (err) {
    console.error("[ms-graph] events fetch failed:", err);
    return [];
  }
}

export async function fetchMsUnread(limit = 5): Promise<MsUnreadEmail[]> {
  if (!hasMsToken()) return [];
  const path = `/me/mailFolders/inbox/messages?$filter=isRead eq false&$orderby=receivedDateTime desc&$top=${limit}&$select=from,subject,receivedDateTime,bodyPreview`;
  try {
    const data = (await graphGet(path)) as { value: any[] };
    return (data.value ?? []).map((m) => ({
      source: "Outlook",
      from: m.from?.emailAddress?.address ?? "(unknown)",
      subject: m.subject ?? "(no subject)",
      date: new Date(m.receivedDateTime ?? Date.now()),
      snippet: m.bodyPreview ?? undefined,
    }));
  } catch (err) {
    console.error("[ms-graph] mail fetch failed:", err);
    return [];
  }
}