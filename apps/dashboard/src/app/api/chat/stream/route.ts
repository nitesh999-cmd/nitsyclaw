// POST /api/chat/stream — line-delimited JSON streaming variant of /api/chat.
//
// Why a separate route: the existing /api/chat returns a single JSON response.
// This route runs the same agent loop but streams events back so the browser
// can render text word-by-word AND start voice-out on the first sentence.
//
// Wire format: newline-delimited JSON (NDJSON). Each line is a JSON event:
//   {"type":"start"}                                   sent immediately
//   {"type":"tool","name":"whats_on_my_plate"}         per tool the model calls
//   {"type":"tool_result","name":"...","success":true} per tool result
//   {"type":"text","delta":"Your "}                    text deltas during the
//   {"type":"text","delta":"plate is "}                final round (model is
//   {"type":"text","delta":"clear..."}                 streaming reply)
//   {"type":"done","meta":{rounds, tools, historyLoaded}}  end-of-stream
//
// Errors stream as: {"type":"error","message":"..."}.
//
// Auth/persistence/cross-surface history are identical to /api/chat.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb, insertMessage, insertFeatureRequest, logAudit, redactAuditString } from "@nitsyclaw/shared/db";
import { buildSystemPrompt, loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import { registerAllFeatures, resolvePromptProfileFromContext } from "@nitsyclaw/shared/features";
import { makeSerperSearch, noopWebSearch } from "@nitsyclaw/shared/search";
import {
  completeCommandJob,
  createCommandJob,
  markCommandJobWorking,
  recordCommandJobFailure,
} from "@nitsyclaw/shared/ops/command-jobs";
import { parseLimitedJsonBody, validateChatBody } from "../../../../lib/chat-validation";
import {
  encryptDashboardText,
  getOwnerIdentity,
  logDashboardError,
  publicConfigErrorOrNull,
  publicServerError,
} from "../../../../lib/dashboard-runtime";
import { checkDashboardRateLimit, dashboardRateLimitHeaders } from "../../../../lib/dashboard-rate-limit";
import { requireSameOrigin } from "../../../../lib/request-origin";
import type {
  AgentDeps,
  CalendarClient,
  Embedder,
  ImageAnalyzer,
  LlmClient,
  Transcriber,
} from "@nitsyclaw/shared/agent";
import type { WhatsAppClient } from "@nitsyclaw/shared/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const CHAT_CONFIG_ERROR = "Dashboard AI is not configured.";

function formatLocation(city?: string, region?: string, country?: string): string | undefined {
  const parts = [city, region, country].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function safeToolError(error: unknown): string {
  return redactAuditString(error instanceof Error ? error.message : `${error}`);
}

class NoopWhatsApp implements WhatsAppClient {
  async ready(): Promise<void> {}
  async send(): Promise<{ id: string }> {
    return { id: "noop-dashboard-stream" };
  }
  onMessage(): void {}
  async destroy(): Promise<void> {}
}

const noopTranscriber: Transcriber = {
  async transcribe() {
    throw new Error("Audio transcription not available in dashboard chat");
  },
};
const noopCalendar: CalendarClient = {
  async suggestSlots() { return []; },
  async createEvent() { return { id: "noop", htmlLink: undefined }; },
  async listEventsToday() { return []; },
};
const noopImageAnalyzer: ImageAnalyzer = {
  async extractReceipt() {
    throw new Error("Image analysis not available in dashboard chat");
  },
};

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
        throw new Error(`OpenAI embedding failed status=${res.status}`);
      }
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data[0]?.embedding ?? [];
    },
  };
}

function buildDashboardDeps(): { deps: AgentDeps; anthropic: Anthropic; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropic = new Anthropic({ apiKey });

  // LlmClient is used only for tool round-trips inside this route. The final
  // round uses anthropic.messages.stream directly so we can pipe deltas.
  const llm: LlmClient = {
    async complete(args) {
      const resp = await anthropic.messages.create({
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
      const resp = await anthropic.messages.create({
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

  const deps: AgentDeps = {
    db: getDb(),
    whatsapp: new NoopWhatsApp(),
    llm,
    transcriber: noopTranscriber,
    webSearch: process.env.SERPER_API_KEY
      ? makeSerperSearch(process.env.SERPER_API_KEY)
      : noopWebSearch,
    calendar: noopCalendar,
    imageAnalyzer: noopImageAnalyzer,
    embedder: openaiKey ? makeOpenAiEmbedder(openaiKey) : { async embed() { return []; } },
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
  return { deps, anthropic, model };
}

export async function POST(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const rateLimit = checkDashboardRateLimit(req, { scope: "dashboard-chat-stream", limit: 30, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return streamSingleEvent(
      { type: "error", message: "Too many chat requests. Please wait a moment and try again." },
      { status: 429, headers: dashboardRateLimitHeaders(rateLimit) },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ reply: CHAT_CONFIG_ERROR }, { status: 503, headers: NO_STORE });
  }
  const rawBody = await parseLimitedJsonBody(req);
  if (!rawBody.ok) {
    return NextResponse.json({ reply: rawBody.reply }, { status: rawBody.status, headers: NO_STORE });
  }
  const parsedBody = validateChatBody(rawBody.body);
  if (!parsedBody.ok) {
    return NextResponse.json({ reply: parsedBody.reply }, { status: parsedBody.status, headers: NO_STORE });
  }
  const last = parsedBody.last;

  let ownerPhone: string;
  let ownerHash: string;
  try {
    ({ ownerPhone, ownerHash } = getOwnerIdentity());
  } catch (e) {
    const configError = publicConfigErrorOrNull(e) ?? { reply: "Dashboard configuration is incomplete.", status: 503 };
    return NextResponse.json({ reply: configError.reply }, { status: configError.status, headers: NO_STORE });
  }

  // /addfeature shortcut — instant path, no streaming needed.
  const addFeatureMatch = last.content.trim().match(/^\/addfeature\s+(.+)$/is);
  if (addFeatureMatch) {
    const description = addFeatureMatch[1]?.trim() ?? "";
    if (description.length < 5) {
      return streamSingleEvent({
        type: "done",
        reply: "Description too short. Try: /addfeature voice input on /chat",
      });
    }
    try {
      const { deps } = buildDashboardDeps();
      const commandJob = await createCommandJob(deps.db, {
        source: "dashboard",
        ownerHash,
        command: last.content,
      });
      if (commandJob.status === "needs_approval" || commandJob.status === "needs_clarification") {
        return streamSingleEvent({
          type: "receipt",
          id: commandJob.id,
          status: commandJob.status,
          text: commandJob.receiptText,
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
        await insertMessage(deps.db, { direction: "in", surface: "dashboard", fromNumber: ownerHash, body: encryptDashboardText(last.content) });
        await insertMessage(deps.db, { direction: "out", surface: "dashboard", fromNumber: ownerHash, body: encryptDashboardText(reply) });
      } catch (persistErr) {
        const configError = publicConfigErrorOrNull(persistErr);
        if (configError) return streamSingleEvent({ type: "error", message: configError.reply }, { status: configError.status });
      }
      await completeCommandJob(deps.db, commandJob.id, reply);
      return streamSingleEvent({ type: "done", reply, featureId: row.id, commandJob: { id: commandJob.id, status: commandJob.status, receiptText: commandJob.receiptText } });
    } catch (e: unknown) {
      logDashboardError("chat.stream.addfeature", e);
      const configError = publicConfigErrorOrNull(e);
      if (configError) return streamSingleEvent({ type: "error", message: configError.reply }, { status: configError.status });
      return streamSingleEvent({ type: "error", message: publicServerError("I could not queue that feature right now. Try again shortly.").reply });
    }
  }

  let built: { deps: AgentDeps; anthropic: Anthropic; model: string };
  try {
    built = buildDashboardDeps();
  } catch (e: unknown) {
    const configError = publicConfigErrorOrNull(e) ?? { reply: "Dashboard configuration is incomplete.", status: 503 };
    return streamSingleEvent({ type: "error", message: configError.reply }, { status: configError.status });
  }
  const { deps, anthropic, model } = built;
  const promptProfile = await resolvePromptProfileFromContext(deps.db, {
    userPhone: ownerPhone,
    now: deps.now(),
    fallback: deps.profile,
  }).catch(() => deps.profile);
  const agentDeps = {
    ...deps,
    profile: promptProfile,
    timezone: promptProfile?.timezone ?? deps.timezone,
  };
  const registry = registerAllFeatures({ surface: "dashboard" });
  const commandJob = await createCommandJob(deps.db, {
    source: "dashboard",
    ownerHash,
    command: last.content,
  });

  if (commandJob.status === "needs_approval" || commandJob.status === "needs_clarification") {
    return streamSingleEvent({
      type: "receipt",
      id: commandJob.id,
      status: commandJob.status,
      text: commandJob.receiptText,
    });
  }

  const history = await loadCrossSurfaceHistory(deps.db, ownerHash, 20).catch(() => []);

  // Build the streaming response.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        send({ type: "start", historyLoaded: history.length });
        send({
          type: "receipt",
          id: commandJob.id,
          status: commandJob.status,
          text: commandJob.receiptText,
        });
        await markCommandJobWorking(deps.db, commandJob.id);

        const messages: Array<{ role: "user" | "assistant"; content: string }> = [
          ...history,
          { role: "user", content: last.content },
        ];
        const toolCalls: Array<{ name: string; input: unknown; output: unknown; success: boolean }> = [];

        // Tool-calling rounds (non-streaming since we need full tool_use blocks before continuing).
        const MAX_TOOL_ROUNDS = 5;
        let finalText = "";
        let rounds = 0;
        for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
          rounds++;
          const resp = await deps.llm.toolStep({
            system: buildSystemPrompt({ surface: "dashboard", profile: promptProfile }),
            messages,
            tools: registry.toAnthropicTools(),
          });
          if (resp.stopReason !== "tool_use" || resp.toolCalls.length === 0) {
            // No more tools — final response will be streamed below.
            // BUT toolStep already produced the text. Stream that text via small chunks
            // so the browser still gets word-by-word feel.
            finalText = resp.text;
            break;
          }
          // Execute tools
          const toolResultParts: string[] = [];
          for (const call of resp.toolCalls) {
            send({ type: "tool", name: call.name });
            const tool = registry.get(call.name);
            const started = Date.now();
            if (!tool) {
              toolCalls.push({ name: call.name, input: call.input, output: null, success: false });
              toolResultParts.push(`[tool ${call.name}] error: Tool unavailable.`);
              send({ type: "tool_result", name: call.name, success: false, error: "Tool unavailable." });
              continue;
            }
            try {
              const parsed = tool.inputSchema.safeParse(call.input);
              if (!parsed.success) throw new Error("Invalid tool input");
              const out = await tool.handler(parsed.data, {
                userPhone: ownerPhone,
                now: agentDeps.now(),
                timezone: agentDeps.timezone,
                deps: agentDeps,
              });
              toolCalls.push({ name: call.name, input: call.input, output: out, success: true });
              toolResultParts.push(`[tool ${call.name}] ${JSON.stringify(out)}`);
              send({ type: "tool_result", name: call.name, success: true });
              await logAudit(deps.db, {
                actor: "agent",
                tool: call.name,
                input: call.input as Record<string, unknown>,
                output: out as Record<string, unknown>,
                success: true,
                durationMs: Date.now() - started,
              });
            } catch (e) {
              const err = safeToolError(e);
              toolCalls.push({ name: call.name, input: call.input, output: null, success: false });
              toolResultParts.push(`[tool ${call.name}] error: Tool failed.`);
              send({ type: "tool_result", name: call.name, success: false, error: "Tool failed." });
              await logAudit(deps.db, {
                actor: "agent",
                tool: call.name,
                input: call.input as Record<string, unknown>,
                success: false,
                error: err,
                durationMs: Date.now() - started,
              });
            }
          }
          messages.push({ role: "assistant", content: resp.text });
          messages.push({ role: "user", content: `Tool results:\n${toolResultParts.join("\n")}` });
        }

        // If we have finalText already (no-tool path or last round of toolStep)
        // stream it word-by-word for the perceived-speed feel even though it's
        // already complete server-side. This still reaches the user 1-2s sooner
        // than waiting for the full JSON response since tool rounds are over.
        if (finalText) {
          const words = finalText.split(/(\s+)/);
          for (const w of words) {
            send({ type: "text", delta: w });
            // Small yield to keep flushing rather than batching
            await new Promise((r) => setTimeout(r, 5));
          }
        } else {
          // All MAX_TOOL_ROUNDS exhausted with no final text — issue a proper
          // streaming call to wrap up.
          const stream2 = anthropic.messages.stream({
            model,
            max_tokens: 1500,
            system: buildSystemPrompt({ surface: "dashboard", profile: promptProfile }),
            tools: registry.toAnthropicTools() as Anthropic.Tool[],
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          });
          for await (const event of stream2) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const delta = event.delta.text;
              finalText += delta;
              send({ type: "text", delta });
            }
          }
        }

        // Persist user + assistant
        try {
          await insertMessage(deps.db, { direction: "in", surface: "dashboard", fromNumber: ownerHash, body: encryptDashboardText(last.content) });
          await insertMessage(deps.db, { direction: "out", surface: "dashboard", fromNumber: ownerHash, body: encryptDashboardText(finalText || "(empty reply)") });
        } catch (persistErr) {
          const configError = publicConfigErrorOrNull(persistErr);
          if (configError) {
            send({ type: "error", message: configError.reply });
            return;
          }
          logDashboardError("chat.stream.persist", persistErr);
        }
        await completeCommandJob(deps.db, commandJob.id, finalText || "Done.");

        send({
          type: "done",
          meta: {
            rounds,
            tools: toolCalls.map((c) => ({ name: c.name, success: c.success })),
            historyLoaded: history.length,
          },
        });
      } catch (e: unknown) {
        await recordCommandJobFailure(deps.db, commandJob.id, e);
        const configError = publicConfigErrorOrNull(e);
        if (configError) {
          send({ type: "error", message: configError.reply });
          return;
        }
        logDashboardError("chat.stream", e);
        send({ type: "error", message: publicServerError("I hit a server problem while answering. Try again shortly.").reply });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function streamSingleEvent(event: Record<string, unknown>, init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    ...init,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}
