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
import { getDb, insertMessage, insertFeatureRequest } from "@nitsyclaw/shared/db";
import { runAgent, buildSystemPrompt, loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import { registerAllFeatures } from "@nitsyclaw/shared/features";
import { validateChatBody, validateContentLength } from "../../../lib/chat-validation";
import { encryptDashboardText, getOwnerIdentity, publicConfigError } from "../../../lib/dashboard-runtime";
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

function formatLocation(city?: string, region?: string, country?: string): string | undefined {
  const parts = [city, region, country].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

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
      // Append Anthropic server-side web_search so the model can fetch current info.
      const allTools = [
        ...(args.tools as Anthropic.Tool[]),
        { type: "web_search_20250305", name: "web_search", max_uses: 5 },
      ] as Anthropic.Tool[];
      const resp = await client.messages.create({
        model,
        max_tokens: 1500,
        system: args.system,
        tools: allTools,
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
    profile: {
      homeLocation: formatLocation(
        process.env.HOME_CITY ?? "Melbourne",
        process.env.HOME_REGION ?? "Victoria",
        process.env.HOME_COUNTRY ?? "Australia",
      ),
      currentLocation:
        formatLocation(process.env.CURRENT_CITY, process.env.CURRENT_REGION, process.env.CURRENT_COUNTRY) ??
        formatLocation(
          process.env.HOME_CITY ?? "Melbourne",
          process.env.HOME_REGION ?? "Victoria",
          process.env.HOME_COUNTRY ?? "Australia",
        ),
      timezone: process.env.TIMEZONE ?? "Australia/Melbourne",
    },
  };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { reply: "Server is missing ANTHROPIC_API_KEY env var." },
      { status: 500 },
    );
  }

  const lengthError = validateContentLength(req.headers.get("content-length"));
  if (lengthError) {
    return NextResponse.json({ reply: lengthError.reply }, { status: lengthError.status });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ reply: "Bad request" }, { status: 400 });
  }
  const parsedBody = validateChatBody(rawBody);
  if (!parsedBody.ok) {
    return NextResponse.json({ reply: parsedBody.reply }, { status: parsedBody.status });
  }
  const last = parsedBody.last;

  try {
    const deps = buildDashboardDeps();
    const registry = registerAllFeatures({ surface: "dashboard" });
    const { ownerPhone, ownerHash } = getOwnerIdentity();

    // /addfeature <description> shortcut (feature_request fr_96407890).
    // Skip the agent loop for instant feedback.
    const addFeatureMatch = last.content.trim().match(/^\/addfeature\s+(.+)$/is);
    if (addFeatureMatch) {
      const description = addFeatureMatch[1]?.trim() ?? "";
      if (description.length < 5) {
        return NextResponse.json({
          reply: 'Description too short. Try: /addfeature voice input on /chat',
          meta: { rounds: 0, tools: [] },
        });
      }
      const row = await insertFeatureRequest(deps.db, {
        description,
        type: "feature",
        size: "M",
        source: "dashboard",
        requestedBy: ownerHash,
      });
      const reply = `Queued! Feature ID: ${row.id.slice(0, 8)}. Build agent will pick it up at next run.`;
      try {
        await insertMessage(deps.db, {
          direction: "in",
          surface: "dashboard",
          fromNumber: ownerHash,
          body: encryptDashboardText(last.content),
        });
        await insertMessage(deps.db, {
          direction: "out",
          surface: "dashboard",
          fromNumber: ownerHash,
          body: encryptDashboardText(reply),
        });
      } catch (persistErr) {
        const configError = publicConfigError(persistErr);
        if (configError.status === 503) {
          return NextResponse.json({ reply: configError.reply }, { status: configError.status });
        }
      }
      return NextResponse.json({
        reply,
        meta: { rounds: 0, tools: [{ name: "request_feature", success: true }], featureId: row.id },
      });
    }

    // Cross-surface history pulled from DB — beats client-supplied history because
    // it spans WhatsApp + dashboard and survives browser refresh.
    const history = await loadCrossSurfaceHistory(deps.db, ownerHash, 20).catch(
      () => [],
    );

    const result = await runAgent({
      userPhone: ownerPhone,
      userMessage: last.content,
      history,
      systemPrompt: buildSystemPrompt({ surface: "dashboard", profile: deps.profile }),
      registry,
      deps,
      maxRounds: 6,
    });

    // Persist the user turn + assistant reply so cross-surface history sees them.
    try {
      await insertMessage(deps.db, {
        direction: "in",
        surface: "dashboard",
        fromNumber: ownerHash,
        body: encryptDashboardText(last.content),
      });
      const replyText = result.finalText?.trim() || "(empty reply)";
      await insertMessage(deps.db, {
        direction: "out",
        surface: "dashboard",
        fromNumber: ownerHash,
        body: encryptDashboardText(replyText),
      });
    } catch (persistErr) {
      const configError = publicConfigError(persistErr);
      if (configError.status === 503) {
        return NextResponse.json({ reply: configError.reply }, { status: configError.status });
      }
      console.error("[chat] persist failed", persistErr);
      // Non-fatal — still return the reply.
    }

    return NextResponse.json({
      reply: result.finalText || "(empty reply)",
      meta: {
        rounds: result.rounds,
        tools: result.toolCalls.map((c) => ({ name: c.name, success: c.success })),
        historyLoaded: history.length,
      },
    });
  } catch (e: unknown) {
    const configError = publicConfigError(e);
    if (configError.status === 503) {
      return NextResponse.json({ reply: configError.reply }, { status: configError.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { reply: `Agent error: ${msg}` },
      { status: 500 },
    );
  }
}
