// Feature 1: Text command — natural-language dispatcher.
//
// This is the entry point for every text message. It does fast-path intent
// detection and exposes a generic `reply` tool that the LLM uses for free-form
// answers when nothing else fits.

import { z } from "zod";
import { detectIntent, type Intent } from "../utils/parse.js";
import { sanitizeUserFacingReply } from "../utils/reply-safety.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export interface TextCommandResult {
  intent: Intent;
  body: string;
}

/**
 * Pure classification of inbound text. No side effects.
 * Tested directly via unit tests.
 */
export function classifyTextCommand(text: string): TextCommandResult {
  const intent = detectIntent(text);
  return { intent, body: text };
}

export function registerTextCommand(registry: ToolRegistry): void {
  registry.register({
    name: "reply_to_user",
    description:
      "Send a free-form text reply to the user on WhatsApp. Use only when no other tool applies and you want to answer in your own words.",
    inputSchema: z.object({
      text: z.string().min(1).describe("The plain-text reply to send"),
    }),
    handler: async (input: { text: string }, ctx: ToolContext) => {
      const body = sanitizeUserFacingReply(input.text);
      if (!body) {
        return { messageId: "suppressed-empty-receipt" };
      }
      const finalBody = await enforceReplyLanguage(body, ctx);
      const out = await ctx.deps.whatsapp.send({
        to: ctx.userPhone,
        body: finalBody,
      });
      return { messageId: out.id };
    },
  });
}

async function enforceReplyLanguage(body: string, ctx: ToolContext): Promise<string> {
  const replyLanguage = ctx.deps.profile?.replyLanguage ?? "English";
  if (!/^english$/i.test(replyLanguage.trim())) return body;
  if (!containsReadableRiskScript(body)) return body;

  try {
    const rewritten = await ctx.deps.llm.complete({
      system:
        "Rewrite the assistant reply into clear English only. Preserve the facts. Do not add new claims. Return only the rewritten reply.",
      messages: [{ role: "user", content: body }],
      maxTokens: 300,
    });
    const cleaned = sanitizeUserFacingReply(rewritten.text);
    if (cleaned && !containsReadableRiskScript(cleaned)) return cleaned;
  } catch {
    // Keep the original answer rather than losing a potentially useful response.
  }

  return body;
}

function containsReadableRiskScript(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (!code) continue;
    if (code >= 0x0900 && code <= 0x097f) return true; // Devanagari
    if (code >= 0x0a80 && code <= 0x0aff) return true; // Gujarati
    if (code >= 0x0b80 && code <= 0x0bff) return true; // Tamil
    if (code >= 0x0c00 && code <= 0x0c7f) return true; // Telugu
    if (code >= 0x0c80 && code <= 0x0cff) return true; // Kannada
    if (code >= 0x0d00 && code <= 0x0d7f) return true; // Malayalam
  }
  return false;
}
