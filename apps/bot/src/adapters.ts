// Concrete adapters for AgentDeps (LLM, transcriber, web, calendar, image, embedder).
// Real-world integrations live here. In tests these are replaced with fakes.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
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
      const resp = await client.messages.create({
        model,
        system,
        max_tokens: 1024,
        tools: tools as Anthropic.Tool[],
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
      // Map mimetype to a filename extension Whisper recognizes.
      // WhatsApp voice notes are typically audio/ogg; codec=opus.
      const subtype = (mimetype.split("/")[1] ?? "ogg").split(";")[0]; // strip ;codec=opus
      const extMap: Record<string, string> = {
        ogg: "ogg",
        oga: "oga",
        opus: "ogg",
        mpeg: "mp3",
        mp3: "mp3",
        wav: "wav",
        webm: "webm",
        m4a: "m4a",
        mp4: "mp4",
        flac: "flac",
      };
      const ext = extMap[subtype] ?? "ogg";
      const file = await toFile(audio, `audio.${ext}`, { type: mimetype.split(";")[0] });
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

/**
 * Anthropic-backed image analyzer. Sends a vision prompt that returns JSON.
 */
export function makeAnthropicImageAnalyzer(apiKey: string, model: string): ImageAnalyzer {
  const client = new Anthropic({ apiKey });
  return {
    async extractReceipt(image: Buffer, mimetype: string) {
      const resp = await client.messages.create({
        model,
        max_tokens: 400,
        system:
          'Extract receipt fields. Return strict JSON: {"amount": number, "currency": "INR"|"USD", "merchant": string, "date": "YYYY-MM-DD", "rawText": string}. Use null for unknowns.',
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

/**
 * Stub web searcher — wires to a real provider in v1.1 (Brave/Tavily/SerpApi).
 */
export const stubWebSearch: WebSearcher = {
  async search(query: string) {
    return [
      {
        title: `Web search not configured — query: ${query}`,
        url: "https://example.com",
        snippet: "Configure WEB_SEARCH_PROVIDER in .env.local to enable real web search.",
      },
    ];
  },
};

/**
 * Stub calendar client — wires to Google Calendar in v1.1.
 * For now returns a slot at the start of the window so flow is testable.
 */
export const stubCalendar: CalendarClient = {
  async suggestSlots({ window }) {
    return [window.start];
  },
  async createEvent({ start }) {
    return { id: `stub-event-${start.toISOString()}` };
  },
};

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
    calendar: stubCalendar,
    imageAnalyzer,
    embedder,
    now: args.now ?? (() => new Date()),
    timezone: args.env.TIMEZONE,
  };
}
