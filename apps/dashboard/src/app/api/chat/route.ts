// Dashboard /api/chat — runs the same agent loop the WhatsApp bot uses,
// so dashboard chat can answer DB-backed questions (reminders, plate, brief,
// memory) using tools instead of deflecting to WhatsApp.
//
// What's wired:    db, llm (Anthropic), embedder (OpenAI), full tool registry.
// What's stubbed:  whatsapp send (no-op), transcriber, calendar.createEvent,
//                  imageAnalyzer, webSearch (returns empty).
//
// Voice + Outlook write are still parked.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@nitsyclaw/shared/db";
import { runAgent } from "@nitsyclaw/shared/agent";
import { registerAllFeatures } from "@nitsyclaw/shared/features";
import type {
  AgentDeps,
  CalendarClient,
  Embedder,
  ImageAnalyzer,
  LlmClient,
  Transcriber,
  WebSearcher,
} from "@nitsyclaw/shared/agent";
import type { WhatsAppClient } from "@nitsyclaw/shared/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatBody {
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

const SYSTEM_PROMPT = `You are NitsyClaw, Nitesh's personal assistant, running on the dashboard chat surface.

You have the same tool access as the WhatsApp surface: reminders, morning brief, what's-on-my-plate, memory recall, web research, schedule a call, log expenses, and confirmation rail. USE THEM. Do not tell the user to switch to WhatsApp — answer here.

Tool routing:
- Questions about today/tomorrow's schedule → whats_on_my_plate
- Reminder questions → list_reminders or relevant memory tool
- "Remember X" / "What do I know about Y" → memory tools
- Birthdays, contacts → memory + reminders (no native contacts tool yet — search memory first)
- Web/research/news → web_research
- Schedule a call → schedule_call (note: dashboard cannot send WhatsApp confirmations; use the tool, then summarize the result)

Be concise. Plain text. No markdown headers. If a tool returns no results, say so plainly. If a question genuinely cannot be answered with available tools, say what's missing instead of redirecting elsewhere.`;

class NoopWhatsApp implements WhatsAppClient {
  async ready(): Promise<void> { /* noop */ }
  async send(): Promise<{ id: string }> {
    return { id: "noop-dashboard" };
  }
  onMessage(): void { /* noop */ }
  async destroy(): Promise<void> { /* noop */ }
}

const noopTranscriber: Transcriber = {
  async transcribe() {
    throw new Error("Audio transcription not available in dashboard chat");
  },
};

const noopWebSearch: WebSearcher = {
  async search() { return []; },
};

const noopCalendar: CalendarClient = {
  async suggestSlots() { return []; },
  async createEvent() {
    return { id: "noop", htmlLink: undefined };
  },
  async listEventsToday() { return []; },
};

const noopImageAnalyzer: ImageAnalyzer = {
  async extractReceipt() {
    throw new Error("Image analysis not available in dashboard chat");
  },
};

function makeAnthropicLlm(apiKey: string, model: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    async complete(args) {
      const resp = await client.messages.create({
        model,
        max_tokens: args.maxTokens ?? 1024,
        system: args.system,
        messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      return { text };
    },

    async toolStep(args) {
      const resp = await client.messages.create({
        model,
        max_tokens: 1500,
        system: args.system,
        tools: args.tools as Anthropic.Tool[],
        messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      const toolCalls = resp.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const tu = b as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
          return { id: tu.id, name: tu.name, input: tu.input };
        });
      const stopReason = (resp.stop_reason ?? "end_turn") as "end_turn" | "tool_use" | "max_tokens";
      return { stopReason, toolCalls, text };
    },
  };
}

function makeOpenAiEmbedder(apiKey: string): Embedder {
  return {
    async embed(text: string): Promise<number[]> {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`OpenAI embedding ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data[0]?.embedding ?? [];
    },
  };
}

function buildDashboardDeps(): AgentDeps {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const openaiKey = process.env.OPENAI_API_KEY;

  return {
    db: getDb(),
    whatsapp: new NoopWhatsApp(),
    llm: makeAnthropicLlm(apiKey, model),
    transcriber: noopTranscriber,
    webSearch: noopWebSearch,
    calendar: noopCalendar,
    imageAnalyzer: noopImageAnalyzer,
    embedder: openaiKey
      ? makeOpenAiEmbedder(openaiKey)
      : { async embed() { return []; } },
    now: () => new Date(),
    timezone: process.env.TIMEZONE ?? "Australia/Melbourne",
  };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { reply: "Server is missing ANTHROPIC_API_KEY env var." },
      { status: 500 },
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ reply: "Bad request" }, { status: 400 });
  }
  if (!body.history?.length) {
    return NextResponse.json({ reply: "No messages provided" }, { status: 400 });
  }

  const last = body.history[body.history.length - 1];
  if (last.role !== "user") {
    return NextResponse.json({ reply: "Last message must be from user" }, { status: 400 });
  }
  const prior = body.history.slice(0, -1);

  try {
    const deps = buildDashboardDeps();
    const registry = registerAllFeatures();
    const ownerPhone = process.env.WHATSAPP_OWNER_NUMBER ?? "61430008008";

    const result = await runAgent({
      userPhone: ownerPhone,
      userMessage: last.content,
      history: prior,
      systemPrompt: SYSTEM_PROMPT,
      registry,
      deps,
      maxRounds: 6,
    });

    return NextResponse.json({
      reply: result.finalText || "(empty reply)",
      meta: {
        rounds: result.rounds,
        tools: result.toolCalls.map((c) => ({ name: c.name, success: c.success })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { reply: `Agent error: ${msg}` },
      { status: 500 },
    );
  }
}
