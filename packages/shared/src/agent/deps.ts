import type { DB } from "../db/client.js";
import type { WhatsAppClient } from "../whatsapp/client.js";

/**
 * Dependencies a feature/tool needs. Injected, never imported globally.
 * This is the seam that makes everything testable.
 */
export interface AgentDeps {
  db: DB;
  whatsapp: WhatsAppClient;
  llm: LlmClient;
  transcriber: Transcriber;
  webSearch: WebSearcher;
  calendar: CalendarClient;
  imageAnalyzer: ImageAnalyzer;
  embedder: Embedder;
  /** for deterministic tests */
  now: () => Date;
  timezone: string;
}

export interface LlmClient {
  /** Single-shot completion. */
  complete(args: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens?: number;
  }): Promise<{ text: string }>;

  /** Tool-use loop step. Returns stop reason and any tool calls. */
  toolStep(args: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    tools: Array<{ name: string; description: string; input_schema: unknown }>;
  }): Promise<{
    stopReason: "end_turn" | "tool_use" | "max_tokens";
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
    text: string;
  }>;
}

export interface Transcriber {
  transcribe(audio: Buffer, mimetype: string): Promise<string>;
}

export interface WebSearcher {
  search(query: string): Promise<Array<{ title: string; url: string; snippet: string }>>;
}

export interface CalendarClient {
  suggestSlots(args: { durationMin: number; participants: string[]; window: { start: Date; end: Date } }): Promise<Date[]>;
  createEvent(args: {
    title: string;
    start: Date;
    durationMin: number;
    participants: string[];
    description?: string;
  }): Promise<{ id: string; htmlLink?: string }>;
  /**
   * Optional Outlook (Microsoft 365) calendar write path.
   * Only wired on the bot surface (token lives at apps/bot/ms-token.json on the always-on laptop).
   * Dashboard surface (Vercel) leaves this undefined; resolve_confirmation falls back to Google.
   */
  createOutlookEvent?(args: {
    title: string;
    start: Date;
    durationMin: number;
    participants: string[];
    description?: string;
  }): Promise<{ id: string; htmlLink?: string }>;
  listEventsToday?(timezone: string): Promise<Array<{ title: string; start: Date }>>;
}
export interface ImageAnalyzer {
  /** Returns structured fields extracted from a receipt image. */
  extractReceipt(image: Buffer, mimetype: string): Promise<{
    amount?: number;
    currency?: string;
    merchant?: string;
    date?: Date;
    rawText?: string;
  }>;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
}
