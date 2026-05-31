export type SafeCommandRisk = "low" | "medium" | "high";

export interface SafeCommandParseInput {
  text: string;
}

export interface SafeCommandParseResult {
  intent: string;
  target: string;
  dateText?: string;
  channel: string;
  risk: SafeCommandRisk;
  requiresConfirmation: boolean;
  confirmationReason: string;
}

const INTENT_PATTERNS: Array<[string, RegExp]> = [
  ["delete", /\b(delete|remove|erase|wipe)\b/i],
  ["send", /\b(send|message|text|sms|email|forward|share|post|publish)\b/i],
  ["pay", /\b(pay|transfer|refund|purchase|buy|order|spend)\b/i],
  ["call", /\b(call|ring|phone)\b/i],
  ["book", /\b(book|schedule|reserve|appointment)\b/i],
  ["connect", /\b(connect|grant|authorize|authorise|login|sync)\b/i],
  ["read", /\b(read|open|browse|access)\b/i],
  ["import", /\b(import|upload|scan)\b/i],
  ["export", /\b(export|download)\b/i],
  ["search", /\b(search|find|look up|research)\b/i],
  ["draft", /\b(draft|write|prepare|compose)\b/i],
  ["remember", /\b(remember|save|note)\b/i],
  ["summarise", /\b(summarise|summarize|summary)\b/i],
  ["remind", /\b(remind|reminder|nudge)\b/i],
];

const CHANNEL_PATTERNS: Array<[string, RegExp]> = [
  ["whatsapp", /\b(whatsapp|wa)\b/i],
  ["sms", /\b(sms|text message|text)\b/i],
  ["email", /\b(email|gmail|outlook|mailbox)\b/i],
  ["phone", /\b(call|phone|ring)\b/i],
  ["calendar", /\b(calendar|meeting|appointment|schedule)\b/i],
  ["bank", /\b(bank|payment|transfer|card)\b/i],
  ["files", /\b(drive|onedrive|file|document|pdf|photo|photos)\b/i],
];

const HIGH_RISK_INTENTS = new Set(["delete", "send", "pay", "call", "book", "connect"]);
const MEDIUM_RISK_INTENTS = new Set(["read", "import", "export"]);
const HIGH_RISK_CHANNELS = new Set(["sms", "email", "phone", "calendar", "bank"]);
const MEDIUM_RISK_CHANNELS = new Set(["files", "whatsapp"]);
const VAGUE_TARGET_RE = /\b(this|that|it|him|her|them|someone|something)\b/i;
const DATE_RE = /\b(?:today|tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+\d{1,2}(?:st|nd|rd|th)?|by\s+[^,.!?]+|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;

export function parseSafeCommand(input: SafeCommandParseInput): SafeCommandParseResult {
  const text = clean(input.text);
  const intent = firstMatch(text, INTENT_PATTERNS) ?? "capture";
  const channel = detectChannel(text);
  const dateText = firstDate(text);
  const target = extractTarget(text, intent);
  const risk = calculateRisk({ intent, channel, target });
  const requiresConfirmation = risk === "high" || (risk === "medium" && changesExternalData(intent));

  return {
    intent,
    target,
    ...(dateText ? { dateText } : {}),
    channel,
    risk,
    requiresConfirmation,
    confirmationReason: reasonFor({ intent, channel, risk, target, requiresConfirmation }),
  };
}

export function isHighRiskCommand(input: string): boolean {
  return parseSafeCommand({ text: input }).risk === "high";
}

function calculateRisk(args: { intent: string; channel: string; target: string }): SafeCommandRisk {
  if (HIGH_RISK_INTENTS.has(args.intent) || HIGH_RISK_CHANNELS.has(args.channel)) return "high";
  if (MEDIUM_RISK_INTENTS.has(args.intent) || MEDIUM_RISK_CHANNELS.has(args.channel)) return "medium";
  if (VAGUE_TARGET_RE.test(args.target) && changesExternalData(args.intent)) return "high";
  return "low";
}

function changesExternalData(intent: string): boolean {
  return ["delete", "send", "pay", "call", "book", "connect", "import", "export"].includes(intent);
}

function reasonFor(args: {
  intent: string;
  channel: string;
  risk: SafeCommandRisk;
  target: string;
  requiresConfirmation: boolean;
}): string {
  if (!args.requiresConfirmation) return "safe local or draft-style action";
  if (HIGH_RISK_INTENTS.has(args.intent)) return `${args.intent} can affect other people, money, accounts, or external systems`;
  if (HIGH_RISK_CHANNELS.has(args.channel)) return `${args.channel} action can leave NitsyClaw`;
  if (VAGUE_TARGET_RE.test(args.target)) return "risky action has a vague target";
  return "action may change or expose private data";
}

function firstMatch(text: string, patterns: Array<[string, RegExp]>): string | null {
  for (const [value, pattern] of patterns) {
    if (pattern.test(text)) return value;
  }
  return null;
}

function detectChannel(text: string): string {
  const matched = CHANNEL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([value]) => value);
  const highRisk = matched.find((value) => HIGH_RISK_CHANNELS.has(value));
  if (highRisk) return highRisk;
  const mediumRisk = matched.find((value) => MEDIUM_RISK_CHANNELS.has(value));
  if (mediumRisk) return mediumRisk;
  return matched[0] ?? "dashboard";
}

function firstDate(text: string): string | null {
  const match = text.match(DATE_RE);
  return match?.[0]?.trim() ?? null;
}

function extractTarget(text: string, intent: string): string {
  const withoutPolitePrefix = text
    .replace(/^\s*(please|can you|could you|nitsy|claw|hey|hi)\b[:,\s]*/i, "")
    .trim();
  const stripped = stripIntentPhrase(withoutPolitePrefix, intent).trim();
  return (stripped || withoutPolitePrefix || text).slice(0, 160);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripIntentPhrase(text: string, intent: string): string {
  switch (intent) {
    case "delete":
      return text.replace(/\b(delete|remove|erase|wipe)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "send":
      return text.replace(/\b(send|message|text|sms|email|forward|share|post|publish)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "pay":
      return text.replace(/\b(pay|transfer|refund|purchase|buy|order|spend)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "call":
      return text.replace(/\b(call|ring|phone)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "book":
      return text.replace(/\b(book|schedule|reserve|appointment)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "connect":
      return text.replace(/\b(connect|grant|authorize|authorise|login|sync)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "read":
      return text.replace(/\b(read|open|browse|access)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "import":
      return text.replace(/\b(import|upload|scan)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "export":
      return text.replace(/\b(export|download)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "search":
      return text.replace(/\b(search|find|look up|research)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "draft":
      return text.replace(/\b(draft|write|prepare|compose)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "remember":
      return text.replace(/\b(remember|save|note)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "summarise":
      return text.replace(/\b(summarise|summarize|summary)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    case "remind":
      return text.replace(/\b(remind|reminder|nudge)\b\s*(?:to\s+|for\s+|with\s+)?/i, "");
    default:
      return text;
  }
}
