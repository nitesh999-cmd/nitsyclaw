// Concrete adapters for AgentDeps (LLM, transcriber, web, calendar, image, embedder).
// Real-world integrations live here. In tests these are replaced with fakes.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { google } from "googleapis";
import { loadOAuthClient, hasGoogleToken } from "./google-auth.js";
import { createMsEvent } from "./microsoft-graph.js";
import type {
  AgentDeps,
  CalendarClient,
  Embedder,
  ImageAnalyzer,
  LlmClient,
  Transcriber,
  WebSearcher,
} from "@nitsyclaw/shared/agent";

export function makeAnthropicLlm(apiKey: string, model: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    async complete({ system, messages, maxTokens }) {
      const resp = await client.messages.create({
        model,
        system,
        max_tokens: maxTokens ?? 1024,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      return { text };
    },
    async toolStep({ system, messages, tools }) {
      // Append Anthropic server-side web_search so the model can fetch current
      // info without us running our own search infra. Free local registry tools
      // continue to be dispatched in our agent loop; web_search runs server-side
      // and its results come back inline as part of the assistant message.
      const allTools = [
        ...(tools as Anthropic.Tool[]),
        { type: "web_search_20250305", name: "web_search", max_uses: 5 },
      ] as Anthropic.Tool[];
      const resp = await client.messages.create({
        model,
        system,
        max_tokens: 1024,
        tools: allTools,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const toolCalls = resp.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const tu = b as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
          return { id: tu.id, name: tu.name, input: tu.input };
        });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      return {
        stopReason: (resp.stop_reason ?? "end_turn") as "end_turn" | "tool_use" | "max_tokens",
        toolCalls,
        text,
      };
    },
  };
}

export function makeOpenAiTranscriber(apiKey: string, model: string): Transcriber {
  const client = new OpenAI({ apiKey });
  return {
    async transcribe(audio: Buffer, mimetype: string) {
      const { toFile } = await import("openai/uploads");
      const subtype = (mimetype.split("/")[1] ?? "ogg").split(";")[0] ?? "ogg";
      const extMap: Record<string, string> = {
        ogg: "ogg", oga: "oga", opus: "ogg", mpeg: "mp3", mp3: "mp3",
        wav: "wav", webm: "webm", m4a: "m4a", mp4: "mp4", flac: "flac",
      };
      const ext = extMap[subtype] ?? "ogg";
      const file = await toFile(audio, "audio." + ext, { type: mimetype.split(";")[0] });
      const out = await client.audio.transcriptions.create({ file, model });
      return out.text ?? "";
    },
  };
}

export function makeOpenAiEmbedder(apiKey: string): Embedder {
  const client = new OpenAI({ apiKey });
  return {
    async embed(text: string) {
      const out = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      return out.data[0]!.embedding;
    },
  };
}

export function makeAnthropicImageAnalyzer(apiKey: string, model: string): ImageAnalyzer {
  const client = new Anthropic({ apiKey });
  return {
    async extractReceipt(image: Buffer, mimetype: string) {
      const resp = await client.messages.create({
        model,
        max_tokens: 400,
        system: 'Extract receipt fields. Return strict JSON: {"amount": number, "currency": "INR"|"USD", "merchant": string, "date": "YYYY-MM-DD", "rawText": string}. Use null for unknowns.',
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimetype as "image/jpeg" | "image/png" | "image/webp",
                  data: image.toString("base64"),
                },
              },
              { type: "text", text: "Extract the receipt fields." },
            ],
          },
        ],
      });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      try {
        const json = JSON.parse(text);
        return {
          amount: typeof json.amount === "number" ? json.amount : undefined,
          currency: json.currency ?? undefined,
          merchant: json.merchant ?? undefined,
          date: json.date ? new Date(json.date) : undefined,
          rawText: json.rawText ?? text,
        };
      } catch {
        return { rawText: text };
      }
    },
  };
}

export const stubWebSearch: WebSearcher = {
  async search(query: string) {
    return [
      {
        title: "Web search not configured - query: " + query,
        url: "https://example.com",
        snippet: "Configure WEB_SEARCH_PROVIDER in .env.local to enable real web search.",
      },
    ];
  },
};

export const realCalendar: CalendarClient = {
  async suggestSlots({ durationMin, window }) {
    if (!hasGoogleToken()) return [window.start];
    const auth = loadOAuthClient();
    const cal = google.calendar({ version: "v3", auth });
    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin: window.start.toISOString(),
        timeMax: window.end.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const busy = (fb.data.calendars?.primary?.busy ?? []).map((b) => ({
      start: new Date(b.start ?? ""),
      end: new Date(b.end ?? ""),
    }));
    const slots: Date[] = [];
    const step = 30 * 60 * 1000;
    const dur = durationMin * 60 * 1000;
    for (let t = window.start.getTime(); t + dur <= window.end.getTime() && slots.length < 3; t += step) {
      const slotEnd = t + dur;
      const conflicts = busy.some((b) => t < b.end.getTime() && slotEnd > b.start.getTime());
      if (!conflicts) slots.push(new Date(t));
    }
    return slots.length ? slots : [window.start];
  },

  async createEvent({ title, start, durationMin, participants, description }) {
    if (!hasGoogleToken()) return { id: "no-token-" + start.toISOString() };
    const auth = loadOAuthClient();
    const cal = google.calendar({ version: "v3", auth });
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    const ev = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: participants.map((email) => ({ email })),
      },
      sendUpdates: "all",
    });
    return { id: ev.data.id ?? "", htmlLink: ev.data.htmlLink ?? undefined };
  },

  async createOutlookEvent({ title, start, durationMin, participants, description }) {
    const ev = await createMsEvent({
      title,
      start,
      durationMin,
      participants,
      description,
      timezone: process.env.TIMEZONE ?? "Australia/Melbourne",
    });
    return { id: ev.id, htmlLink: ev.webLink };
  },

  async listEventsToday(timezone: string) {
    if (!hasGoogleToken()) return [];
    const auth = loadOAuthClient();
    const cal = google.calendar({ version: "v3", auth });
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const list = await cal.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      timeZone: timezone,
    });
    return (list.data.items ?? []).map((e) => ({
      title: e.summary ?? "(no title)",
      start: new Date(e.start?.dateTime ?? e.start?.date ?? Date.now()),
    }));
  },
};

export const stubCalendar = realCalendar;

export interface BotConfigEnv {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
  OPENAI_API_KEY?: string;
  TRANSCRIPTION_MODEL: string;
  TIMEZONE: string;
}

export function buildAgentDeps(args: {
  env: BotConfigEnv;
  db: AgentDeps["db"];
  whatsapp: AgentDeps["whatsapp"];
  now?: () => Date;
}): AgentDeps {
  const llm = makeAnthropicLlm(args.env.ANTHROPIC_API_KEY, args.env.ANTHROPIC_MODEL);
  const transcriber = args.env.OPENAI_API_KEY
    ? makeOpenAiTranscriber(args.env.OPENAI_API_KEY, args.env.TRANSCRIPTION_MODEL)
    : { async transcribe() { throw new Error("OPENAI_API_KEY not set"); } };
  const embedder = args.env.OPENAI_API_KEY
    ? makeOpenAiEmbedder(args.env.OPENAI_API_KEY)
    : { async embed() { return []; } };
  const imageAnalyzer = makeAnthropicImageAnalyzer(args.env.ANTHROPIC_API_KEY, args.env.ANTHROPIC_MODEL);
  return {
    db: args.db,
    whatsapp: args.whatsapp,
    llm,
    transcriber,
    webSearch: stubWebSearch,
    calendar: realCalendar,
    aggregator: {
      fetchAllEventsToday,
      fetchAllUnreadEmails,
      searchAllGmail,
    },
    imageAnalyzer,
    embedder,
    now: args.now ?? (() => new Date()),
    timezone: args.env.TIMEZONE,
  };
}
// ====================================================================
// Multi-account email + calendar aggregation
// ====================================================================
import { google as googleApiAgg } from "googleapis";
import { listGoogleAccounts, loadOAuthClient as loadGoogleOAuthClientAgg } from "./google-auth.js";
import { fetchMsEventsToday, fetchMsUnread } from "./microsoft-graph.js";
// Yahoo IMAP parked (no app password without paid Yahoo Plus). Skipped intentionally.

export interface AggregatedEmail {
  source: string;
  from: string;
  subject: string;
  date: Date;
  snippet?: string;
  id?: string;
}

export interface AggregatedEvent {
  source: string;
  title: string;
  start: Date;
}

export async function fetchAllUnreadEmails(perAccountLimit = 5): Promise<AggregatedEmail[]> {
  const out: AggregatedEmail[] = [];
  for (const label of listGoogleAccounts()) {
    try {
      const auth = loadGoogleOAuthClientAgg(label);
      const gmail = googleApiAgg.gmail({ version: "v1", auth });
      const list = await gmail.users.messages.list({ userId: "me", q: "is:unread in:inbox", maxResults: perAccountLimit });
      for (const msg of list.data.messages ?? []) {
        const detail = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
        const headers = detail.data.payload?.headers ?? [];
        const get = (n: string) => headers.find((h) => h.name === n)?.value ?? "";
        out.push({
          source: `Gmail (${label})`,
          from: get("From"),
          subject: get("Subject") || "(no subject)",
          date: new Date(get("Date") || Date.now()),
          snippet: detail.data.snippet ?? undefined,
        });
      }
    } catch (err) { console.error(`[email] Gmail/${label} failed:`, err); }
  }
  try { out.push(...(await fetchMsUnread(perAccountLimit))); } catch (err) { console.error("[email] M365 failed:", err); }
  // Yahoo skipped (parked, see session 2 / mind.md §6).
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

export async function searchAllGmail(query: string, perAccountLimit = 5): Promise<AggregatedEmail[]> {
  const out: AggregatedEmail[] = [];
  const q = query.trim();
  if (!q) return out;

  for (const label of listGoogleAccounts()) {
    try {
      const auth = loadGoogleOAuthClientAgg(label);
      const gmail = googleApiAgg.gmail({ version: "v1", auth });
      const list = await gmail.users.messages.list({
        userId: "me",
        q: `${q} in:anywhere`,
        maxResults: perAccountLimit,
      });
      for (const msg of list.data.messages ?? []) {
        if (!msg.id) continue;
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const headers = detail.data.payload?.headers ?? [];
        const get = (n: string) => headers.find((h) => h.name === n)?.value ?? "";
        out.push({
          id: msg.id,
          source: `Gmail (${label})`,
          from: get("From"),
          subject: get("Subject") || "(no subject)",
          date: new Date(get("Date") || Date.now()),
          snippet: detail.data.snippet ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[email] Gmail/${label} search failed:`, err);
    }
  }

  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

export async function fetchAllEventsToday(timezone: string): Promise<AggregatedEvent[]> {
  const out: AggregatedEvent[] = [];
  for (const label of listGoogleAccounts()) {
    try {
      const auth = loadGoogleOAuthClientAgg(label);
      const cal = googleApiAgg.calendar({ version: "v3", auth });
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const list = await cal.events.list({
        calendarId: "primary",
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        timeZone: timezone,
      });
      for (const e of list.data.items ?? []) {
        out.push({
          source: `Google (${label})`,
          title: e.summary ?? "(no title)",
          start: new Date(e.start?.dateTime ?? e.start?.date ?? Date.now()),
        });
      }
    } catch (err) { console.error(`[cal] Google/${label} failed:`, err); }
  }
  try {
    const ms = await fetchMsEventsToday(timezone);
    for (const e of ms) out.push({ source: "Outlook", title: e.title, start: e.start });
  } catch (err) { console.error("[cal] M365 failed:", err); }
  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}
