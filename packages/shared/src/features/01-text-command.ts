// Feature 1: Text command — natural-language dispatcher.
//
// This is the entry point for every text message. It does fast-path intent
// detection and exposes a generic `reply` tool that the LLM uses for free-form
// answers when nothing else fits.

import { z } from "zod";
import { detectIntent, type Intent } from "../utils/parse.js";
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
      const out = await ctx.deps.whatsapp.send({ to: ctx.userPhone, body: input.text });
      return { messageId: out.id };
    },
  });
}
