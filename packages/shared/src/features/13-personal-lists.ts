// Feature 13: Personal operating lists that do not need external permissions.

import { z } from "zod";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import { insertMemory, searchMemoriesLexical } from "../db/repo.js";

const CANT_DO_PREFIX = "CAN'T-DO:";
const BIRTHDAY_TEMPLATE_PREFIX = "BIRTHDAY_TEMPLATE:";

function cleanOneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripPrefix(content: string, prefix: string): string {
  return content.startsWith(prefix) ? content.slice(prefix.length).trim() : content;
}

async function addCantDoItem(
  input: {
    item: string;
    reason?: string;
    exception?: string;
    severity?: "hard_no" | "ask_first" | "avoid";
  },
  ctx: ToolContext,
) {
  const parts = [
    `${CANT_DO_PREFIX} ${cleanOneLine(input.item)}`,
    input.reason ? `Reason: ${cleanOneLine(input.reason)}` : null,
    input.exception ? `Exception: ${cleanOneLine(input.exception)}` : null,
  ].filter(Boolean);
  const severity = input.severity ?? "ask_first";
  const row = await insertMemory(ctx.deps.db, {
    kind: "pin",
    content: parts.join(" | "),
    tags: ["cant-do", severity],
  });
  return { id: row.id, item: stripPrefix(row.content, CANT_DO_PREFIX), severity };
}

async function listCantDoItems(input: { query?: string; limit?: number }, ctx: ToolContext) {
  const q = input.query?.trim()
    ? `${CANT_DO_PREFIX} ${input.query.trim()}`
    : CANT_DO_PREFIX;
  const rows = await searchMemoriesLexical(ctx.deps.db, q, input.limit ?? 10);
  const items = rows
    .filter((row) => row.content.startsWith(CANT_DO_PREFIX))
    .map((row) => ({
      id: row.id,
      item: stripPrefix(row.content, CANT_DO_PREFIX),
      tags: row.tags,
      createdAt: row.createdAt.toISOString(),
    }));
  return { count: items.length, items };
}

async function addBirthdayTemplate(
  input: {
    name: string;
    tone: "warm" | "funny" | "professional" | "short" | "family";
    message: string;
  },
  ctx: ToolContext,
) {
  const content = `${BIRTHDAY_TEMPLATE_PREFIX} ${cleanOneLine(input.name)} | Tone: ${input.tone} | Message: ${cleanOneLine(input.message)}`;
  const row = await insertMemory(ctx.deps.db, {
    kind: "pin",
    content,
    tags: ["birthday-template", input.tone],
  });
  return {
    id: row.id,
    name: input.name,
    tone: input.tone,
  };
}

async function listBirthdayTemplates(input: { tone?: string; limit?: number }, ctx: ToolContext) {
  const q = input.tone?.trim()
    ? `${BIRTHDAY_TEMPLATE_PREFIX} ${input.tone.trim()}`
    : BIRTHDAY_TEMPLATE_PREFIX;
  const rows = await searchMemoriesLexical(ctx.deps.db, q, input.limit ?? 10);
  const items = rows
    .filter((row) => row.content.startsWith(BIRTHDAY_TEMPLATE_PREFIX))
    .map((row) => ({
      id: row.id,
      template: stripPrefix(row.content, BIRTHDAY_TEMPLATE_PREFIX),
      tags: row.tags,
      createdAt: row.createdAt.toISOString(),
    }));
  return { count: items.length, items };
}

export function registerPersonalLists(registry: ToolRegistry): void {
  registry.register({
    name: "add_cant_do_item",
    description:
      "Save a personal can't-do rule: things Nitesh should avoid, say no to, or only do after asking first.",
    inputSchema: z.object({
      item: z.string().min(2),
      reason: z.string().optional(),
      exception: z.string().optional(),
      severity: z.enum(["hard_no", "ask_first", "avoid"]).optional(),
    }),
    handler: addCantDoItem,
  });

  registry.register({
    name: "list_cant_do_items",
    description: "List saved can't-do rules, optionally filtered by a query.",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    handler: listCantDoItems,
  });

  registry.register({
    name: "add_birthday_template",
    description:
      "Save a reusable birthday message template for a relationship, tone, or specific person.",
    inputSchema: z.object({
      name: z.string().min(2),
      tone: z.enum(["warm", "funny", "professional", "short", "family"]),
      message: z.string().min(5),
    }),
    handler: addBirthdayTemplate,
  });

  registry.register({
    name: "list_birthday_templates",
    description: "List saved birthday message templates, optionally filtered by tone.",
    inputSchema: z.object({
      tone: z.string().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    handler: listBirthdayTemplates,
  });
}
