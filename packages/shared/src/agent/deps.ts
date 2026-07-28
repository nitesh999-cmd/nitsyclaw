import type { DB } from "../db/client.js";
import type { LiveWebResearcher } from "../search/live-web-research.js";
import type { VerifiedSourceCollector } from "../search/verified-sources.js";
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
  /**
   * Live web research through Anthropic's server-side web search tool.
   * Optional because some surfaces run without an Anthropic key; when absent the
   * bot must say so rather than answer current-information questions from memory.
   */
  liveResearch?: LiveWebResearcher;
  /**
   * Verified title/URL pairs recorded during THIS turn. Created per turn and
   * shared by every delivery path, so a reply written after a search — whether
   * the router pre-searched or the model called web_research itself — shows
   * only links that came from a parsed search result.
   */
  verifiedSources?: VerifiedSourceCollector;
  calendar: CalendarClient;
  aggregator?: AggregatorClient;
  emailDraft?: EmailDraftClient;
  emailSender?: EmailSender;
  imageAnalyzer: ImageAnalyzer;
  embedder: Embedder;
  /** for deterministic tests */
  now: () => Date;
  timezone: string;
  profile?: UserProfile;
}

export interface UserProfile {
  homeLocation?: string;
  currentLocation?: string;
  timezone?: string;
  defaultCurrency?: string;
  replyLanguage?: string;
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

export interface AggregatorClient {
  fetchAllEventsToday(timezone: string): Promise<Array<{ source: string; title: string; start: Date }>>;
  fetchAllUnreadEmails(limit: number): Promise<Array<{ source: string; from: string; subject: string; date?: Date; snippet?: string }>>;
  searchAllGmail?(query: string, limit: number): Promise<Array<{ id?: string; source: string; from: string; subject: string; date: Date; snippet?: string }>>;
}

export interface EmailDraftClient {
  createDraft(args: {
    provider: "gmail" | "outlook";
    accountLabel?: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    replyToMessageId?: string;
  }): Promise<{ draftId: string; messageId?: string; webLink?: string }>;
}

/**
 * Real email send. Distinct from EmailDraftClient because send is a side-effect
 * action gated by the confirmation rail with explicit-id requirement.
 * Only wired on surfaces that have provider OAuth tokens reachable (bot, not Vercel).
 */
export interface EmailSender {
  sendEmail(args: {
    provider: "gmail" | "outlook";
    accountLabel?: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    replyToMessageId?: string;
  }): Promise<{ messageId: string; threadId?: string; webLink?: string }>;
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
