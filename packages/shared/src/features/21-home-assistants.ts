// Feature 21: Small home-use assistant tools for everyday life admin.

import { z } from "zod";
import type { ToolRegistry } from "../agent/tools.js";

type ActionKind = "pay" | "call" | "reply" | "book" | "decide" | "save" | "do";

export interface ExtractActionItemsInput {
  text: string;
  now?: Date;
}

export interface ActionItem {
  title: string;
  kind: ActionKind;
  dueHint?: string;
  priority: "high" | "medium" | "low";
}

export interface TriageLifeAdminNoteInput {
  text: string;
}

export interface DraftWarmReplyInput {
  recipient?: string;
  situation: string;
  intent: string;
  tone?: "warm" | "brief" | "firm" | "friendly";
}

export interface ComparePersonalOptionsInput {
  decision: string;
  options: Array<{
    name: string;
    pros?: string[];
    cons?: string[];
  }>;
  priorities?: string[];
}

export interface PlanPhoneCallScriptInput {
  contact: string;
  goal: string;
  facts?: string[];
}

export interface ExtractRenewalWatchInput {
  text: string;
}

export interface PrepareFirmComplaintInput {
  company: string;
  issue: string;
  desiredOutcome: string;
  deadline?: string;
}

export interface CleanMessyNoteInput {
  text: string;
}

export interface CheckMessageBeforeSendingInput {
  text: string;
}

export interface PlanTravelDayInput {
  destination: string;
  date?: string;
  commitments?: string[];
}

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingDue(text: string): { title: string; dueHint?: string } {
  const due = text.match(/\b(?:by|before|on)\s+([A-Za-z]+|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\.?$/i);
  if (due) {
    return {
      title: cleanText(text.slice(0, due.index).replace(/[.?!]+$/, "")),
      dueHint: due[1],
    };
  }
  const simple = text.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\.?$/i);
  if (simple) {
    return {
      title: cleanText(text.slice(0, simple.index).replace(/[.?!]+$/, "")),
      dueHint: simple[1],
    };
  }
  return { title: cleanText(text.replace(/[.?!]+$/, "")) };
}

function kindFor(title: string): ActionKind {
  const lower = title.toLowerCase();
  if (/^pay\b|\bbill\b|\binvoice\b/.test(lower)) return "pay";
  if (/^call\b|\bphone\b/.test(lower)) return "call";
  if (/^reply\b|\brespond\b|\bmessage\b/.test(lower)) return "reply";
  if (/^book\b|\bschedule\b|\bappointment\b/.test(lower)) return "book";
  if (/^decide\b|\bchoose\b|\bpick\b|\bcompare\b/.test(lower)) return "decide";
  if (/^save\b|\bremember\b|\bpassport\b|\bnote\b/.test(lower)) return "save";
  return "do";
}

function priorityFor(kind: ActionKind, dueHint?: string): ActionItem["priority"] {
  if (kind === "pay" || /today|tomorrow/i.test(dueHint ?? "")) return "high";
  if (kind === "call" || kind === "book" || kind === "decide") return "medium";
  return "low";
}

function sentenceCase(text: string): string {
  const cleaned = cleanText(text);
  if (!cleaned) return cleaned;
  return `${cleaned[0]?.toUpperCase() ?? ""}${cleaned.slice(1)}`;
}

function parseDate(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = MONTHS[(match[2] ?? "").toLowerCase()];
  const year = Number(match[3]);
  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) return undefined;
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function redactLongNumbers(text: string): string {
  return text.replace(/\b\d{10,}\b/g, (value) => `********${value.slice(-4)}`);
}

export function extractActionItemsFromText(input: ExtractActionItemsInput): { items: ActionItem[] } {
  const fragments = cleanText(input.text)
    .split(/(?:[.;\n]+|\s+and\s+)/i)
    .map((part) => cleanText(part))
    .filter(Boolean);

  const items = fragments
    .filter((part) => /\b(pay|call|reply|respond|book|decide|choose|save|remember|send|email|message)\b/i.test(part))
    .map((part) => {
      const { title, dueHint } = stripTrailingDue(part);
      const normalizedTitle = sentenceCase(title.replace(/^need to\s+/i, ""));
      const kind = kindFor(normalizedTitle);
      return {
        title: normalizedTitle,
        kind,
        dueHint,
        priority: priorityFor(kind, dueHint),
      };
    });

  return { items };
}

export function triageLifeAdminNote(input: TriageLifeAdminNoteInput): {
  buckets: Record<"pay" | "reply" | "book" | "decide" | "save" | "other", string[]>;
} {
  const buckets = {
    pay: [] as string[],
    reply: [] as string[],
    book: [] as string[],
    decide: [] as string[],
    save: [] as string[],
    other: [] as string[],
  };
  const parts = cleanText(input.text)
    .replace(/^need to\s+/i, "")
    .split(/[,.;\n]+|\s+and\s+/i)
    .map((part) => cleanText(part.replace(/^need to\s+/i, "")).toLowerCase())
    .filter(Boolean);

  for (const part of parts) {
    if (/^pay\b|\bbill\b|\binvoice\b/.test(part)) buckets.pay.push(part);
    else if (/^reply\b|^respond\b|^message\b|^email\b/.test(part)) buckets.reply.push(part);
    else if (/^book\b|^schedule\b|\bappointment\b/.test(part)) buckets.book.push(part);
    else if (/^decide\b|^choose\b|^compare\b|^pick\b/.test(part)) buckets.decide.push(part);
    else if (/^save\b|^remember\b|passport|licence|license/.test(part)) buckets.save.push(part);
    else buckets.other.push(part);
  }

  return { buckets };
}

export function draftWarmReply(input: DraftWarmReplyInput): { body: string; tone: string } {
  const recipient = input.recipient ? `${cleanText(input.recipient)}, ` : "";
  const situation = cleanText(input.situation).replace(/\.$/, "");
  const intent = cleanText(input.intent).replace(/\.$/, "");
  const body = `Hi ${recipient}thanks for thinking of us. ${sentenceCase(situation)}. I wanted to ${intent}.`;
  return {
    body: body.replace(/\s+/g, " ").trim(),
    tone: input.tone ?? "warm",
  };
}

export function comparePersonalOptions(input: ComparePersonalOptionsInput): {
  recommended: string;
  reason: string;
  scores: Array<{ name: string; score: number }>;
} {
  const priorities = (input.priorities ?? []).map((p) => p.toLowerCase());
  const scores = input.options.map((option) => {
    const haystack = [option.name, ...(option.pros ?? []), ...(option.cons ?? [])].join(" ").toLowerCase();
    const pros = (option.pros ?? []).join(" ").toLowerCase();
    const cons = (option.cons ?? []).join(" ").toLowerCase();
    let score = (option.pros?.length ?? 0) * 2 - (option.cons?.length ?? 0);
    for (const priority of priorities) {
      const reliabilityMatch =
        priority.includes("reliab") && /\b(stable|support|reliable|uptime|consistent)\b/.test(haystack);
      const homeWorkMatch =
        priority.includes("working from home") && /\b(stable|support|upload|internet|reliable)\b/.test(haystack);
      if (pros.includes(priority) || reliabilityMatch || homeWorkMatch) score += 4;
      if (cons.includes(priority)) score -= 4;
    }
    return { name: option.name, score };
  });
  const recommended = [...scores].sort((a, b) => b.score - a.score)[0]?.name ?? input.options[0]?.name ?? "";
  return {
    recommended,
    reason: priorities.length
      ? `${recommended} best matches: ${priorities.join(", ")}.`
      : `${recommended} has the strongest balance of upside and downside.`,
    scores,
  };
}

export function planPhoneCallScript(input: PlanPhoneCallScriptInput): {
  openingLine: string;
  keyQuestions: string[];
  fallbackSms: string;
} {
  const goal = cleanText(input.goal);
  const facts = input.facts?.map(cleanText).filter(Boolean) ?? [];
  return {
    openingLine: `Hi, I am calling to ${goal}.`,
    keyQuestions: [
      "What is the best option you can offer me today?",
      "Are there any fees, lock-ins, or conditions I should know about?",
      "Can you send the details in writing before I decide?",
      ...facts.map((fact) => `Does this change the answer: ${fact}?`),
    ],
    fallbackSms: `Hi ${cleanText(input.contact)}, I wanted to ${goal}. Please send the best option and any conditions in writing.`,
  };
}

export function extractRenewalWatch(input: ExtractRenewalWatchInput): {
  items: Array<{ label: string; date?: string; action: "review renewal" | "cancel or renegotiate" }>;
} {
  const sentences = cleanText(input.text)
    .split(/[.;\n]+/)
    .map(cleanText)
    .filter(Boolean);
  const items: Array<{ label: string; date?: string; action: "review renewal" | "cancel or renegotiate" }> = [];
  for (const sentence of sentences) {
    const date = parseDate(sentence);
    if (!date) continue;
    const renewal = sentence.match(/^([A-Z][A-Za-z0-9 &'/-]{1,40})\s+renews?\b/);
    if (renewal) {
      items.push({ label: cleanText(renewal[1] ?? ""), date, action: "review renewal" });
      continue;
    }
    const cancellation = sentence.match(/^([A-Z][A-Za-z0-9 &'/-]{1,40}?)\s+cancellation\b/i);
    if (cancellation) {
      items.push({ label: sentenceCase(cancellation[1] ?? ""), date, action: "cancel or renegotiate" });
    }
  }
  return { items };
}

export function prepareFirmComplaint(input: PrepareFirmComplaintInput): { message: string } {
  const deadline = input.deadline ? ` Please respond by ${cleanText(input.deadline)}.` : "";
  return {
    message:
      `Hi ${cleanText(input.company)}, I need help resolving this issue: ${cleanText(input.issue)}. ` +
      `Please ${cleanText(input.desiredOutcome)}.${deadline} I am happy to provide more details if needed.`,
  };
}

export function cleanMessyNote(input: CleanMessyNoteInput): { cleaned: string } {
  let text = input.text
    .replace(/[!?]+/g, ".")
    .replace(/\bremember\b/gi, "")
    .replace(/\bmaybe\b/gi, "may be")
    .replace(/\s+also\s+/gi, ". ")
    .replace(/\s+(call|ask|book|pay|reply|decide|save)\s+/gi, ". $1 ")
    .replace(/\.+/g, ".")
    .trim();

  const sentences = text
    .split(".")
    .map((part) => cleanText(part))
    .filter(Boolean)
    .map((part) => sentenceCase(part).replace(/\bvicroads\b/i, "Vicroads"));

  text = sentences.join(". ");
  return { cleaned: text ? `${text}.` : "" };
}

export function checkMessageBeforeSending(input: CheckMessageBeforeSendingInput): {
  flags: Array<"too_heated" | "contains_sensitive_number" | "too_long">;
  saferText: string;
} {
  const flags: Array<"too_heated" | "contains_sensitive_number" | "too_long"> = [];
  const text = cleanText(input.text);
  if (/\b(furious|fix this now|or else|idiot|stupid|useless)\b/i.test(text)) flags.push("too_heated");
  if (/\b\d{10,}\b/.test(text)) flags.push("contains_sensitive_number");
  if (text.length > 900) flags.push("too_long");
  const calmer = text
    .replace(/\bI am furious\.?\s*/i, "")
    .replace(/\bFix this now or else\.?/i, "Please help me resolve this.");
  return {
    flags,
    saferText: redactLongNumbers(cleanText(calmer)),
  };
}

export function planTravelDay(input: PlanTravelDayInput): {
  title: string;
  checklist: string[];
} {
  const commitments = input.commitments?.map(cleanText).filter(Boolean) ?? [];
  const checklist = [
    `Confirm travel time to ${cleanText(input.destination)}${input.date ? ` for ${input.date}` : ""}.`,
    "Pack wallet, keys, charger, and any required ID.",
    ...commitments.map((commitment) =>
      /park/i.test(commitment) ? "Confirm parking plan." : `Remember: ${commitment}.`,
    ),
  ];
  if (commitments.some((item) => /passport/i.test(item))) checklist.unshift("Pack passport.");
  return {
    title: `Travel day for ${cleanText(input.destination)}`,
    checklist: Array.from(new Set(checklist)),
  };
}

export function registerHomeAssistants(registry: ToolRegistry): void {
  registry.register({
    name: "extract_action_items",
    description: "Extract practical action items from messy life-admin text.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: { text: string }, ctx) => extractActionItemsFromText({ ...input, now: ctx.now }),
  });

  registry.register({
    name: "triage_life_admin_note",
    description: "Sort a messy life-admin note into pay, reply, book, decide, save, and other buckets.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: TriageLifeAdminNoteInput) => triageLifeAdminNote(input),
  });

  registry.register({
    name: "draft_warm_reply",
    description: "Draft a short warm reply for normal everyday messages.",
    inputSchema: z.object({
      recipient: z.string().optional(),
      situation: z.string().min(1),
      intent: z.string().min(1),
      tone: z.enum(["warm", "brief", "firm", "friendly"]).optional(),
    }),
    handler: async (input: DraftWarmReplyInput) => draftWarmReply(input),
  });

  registry.register({
    name: "compare_personal_options",
    description: "Compare everyday personal options and return a clear recommendation.",
    inputSchema: z.object({
      decision: z.string().min(1),
      options: z.array(z.object({ name: z.string().min(1), pros: z.array(z.string()).optional(), cons: z.array(z.string()).optional() })),
      priorities: z.array(z.string()).optional(),
    }),
    handler: async (input: ComparePersonalOptionsInput) => comparePersonalOptions(input),
  });

  registry.register({
    name: "plan_phone_call_script",
    description: "Prepare a simple phone-call script, key questions, and fallback SMS.",
    inputSchema: z.object({
      contact: z.string().min(1),
      goal: z.string().min(1),
      facts: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanPhoneCallScriptInput) => planPhoneCallScript(input),
  });

  registry.register({
    name: "extract_renewal_watch",
    description: "Extract renewal, cancellation, and notice-date watch items from text.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: ExtractRenewalWatchInput) => extractRenewalWatch(input),
  });

  registry.register({
    name: "prepare_firm_complaint",
    description: "Prepare a calm firm complaint message with a clear ask and deadline.",
    inputSchema: z.object({
      company: z.string().min(1),
      issue: z.string().min(1),
      desiredOutcome: z.string().min(1),
      deadline: z.string().optional(),
    }),
    handler: async (input: PrepareFirmComplaintInput) => prepareFirmComplaint(input),
  });

  registry.register({
    name: "clean_messy_note",
    description: "Turn a messy note into a short readable note.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: CleanMessyNoteInput) => cleanMessyNote(input),
  });

  registry.register({
    name: "check_message_before_sending",
    description: "Check an outgoing message for heated tone, long sensitive numbers, or avoidable risk.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: CheckMessageBeforeSendingInput) => checkMessageBeforeSending(input),
  });

  registry.register({
    name: "plan_travel_day",
    description: "Prepare a simple travel-day checklist from destination, date, and commitments.",
    inputSchema: z.object({
      destination: z.string().min(1),
      date: z.string().optional(),
      commitments: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanTravelDayInput) => planTravelDay(input),
  });
}
