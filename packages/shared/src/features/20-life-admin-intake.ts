// Feature 20: Life admin intake analysis for bills, contracts, documents, and social links.

import { z } from "zod";
import type { ToolRegistry } from "../agent/tools.js";

export type LifeAdminIntakeKind =
  | "bill"
  | "contract"
  | "social_video"
  | "receipt"
  | "document"
  | "message";

export type SuggestedActionKind =
  | "compare_bill"
  | "reminder"
  | "review_contract"
  | "analyze_social_video"
  | "save_memory"
  | "summarize"
  | "extract_text";

export type IntakePriority = "high" | "medium" | "low";

export interface KeyFact {
  label: string;
  value: string;
  source: "extracted" | "inferred";
}

export interface SuggestedAction {
  kind: SuggestedActionKind;
  label: string;
  priority: IntakePriority;
  reason: string;
}

export interface LifeAdminIntakeResult {
  kind: LifeAdminIntakeKind;
  title: string;
  confidence: "high" | "medium" | "low";
  safePreview: string;
  keyFacts: KeyFact[];
  suggestedActions: SuggestedAction[];
  warnings: string[];
}

export interface LifeAdminIntakeInput {
  text?: string;
  mediaType?: "image" | "voice" | "document";
  filename?: string;
  mimetype?: string;
  now?: Date;
}

export interface DocumentTextExtractionInput {
  data: Buffer | Uint8Array;
  mimetype?: string;
  filename?: string;
  maxBytes?: number;
  maxTextChars?: number;
  parseTimeoutMs?: number;
}

export interface DocumentTextExtractionResult {
  supported: boolean;
  text?: string;
  reason?: string;
  truncated: boolean;
  byteLength: number;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".xml", ".html", ".htm", ".log"]);
const TEXT_MIMETYPES = new Set([
  "application/csv",
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/xml",
]);
const DEFAULT_MAX_DOCUMENT_BYTES = 10_000_000;
const DEFAULT_MAX_DOCUMENT_TEXT_CHARS = 12_000;
const DEFAULT_PDF_PARSE_TIMEOUT_MS = 5_000;

function lowerExtension(filename: string | undefined): string {
  const match = filename?.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function isTextLikeDocument(mimetype: string | undefined, filename: string | undefined): boolean {
  const type = mimetype?.split(";")[0]?.trim().toLowerCase();
  if (type?.startsWith("text/")) return true;
  if (type && TEXT_MIMETYPES.has(type)) return true;
  return TEXT_EXTENSIONS.has(lowerExtension(filename));
}

function looksBinary(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 4000);
  const controlChars = sample.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)?.length ?? 0;
  return controlChars / sample.length > 0.02;
}

export async function extractDocumentTextFromMedia(input: DocumentTextExtractionInput): Promise<DocumentTextExtractionResult> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
  const maxTextChars = input.maxTextChars ?? DEFAULT_MAX_DOCUMENT_TEXT_CHARS;
  const parseTimeoutMs = input.parseTimeoutMs ?? DEFAULT_PDF_PARSE_TIMEOUT_MS;
  const byteLength = input.data.byteLength;
  const mimetype = input.mimetype?.split(";")[0]?.trim().toLowerCase();
  const filename = input.filename?.trim();

  if (mimetype === "application/pdf" || lowerExtension(filename) === ".pdf") {
    if (byteLength > maxBytes) {
      return {
        supported: false,
        reason: "PDF is too large to extract safely in WhatsApp. Try a smaller file or screenshot.",
        truncated: false,
        byteLength,
      };
    }

    let parser: { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> } | undefined;
    try {
      const { PDFParse } = await import("pdf-parse");
      parser = new PDFParse({ data: Buffer.from(input.data) });
      const result = await withTimeout(
        parser.getText(),
        parseTimeoutMs,
        "PDF text extraction timed out. Try a smaller file or screenshot.",
      );
      const extracted = limitText(normalizeText(result.text ?? ""), maxTextChars);
      const text = extracted.text;
      if (!text) {
        return {
          supported: false,
          reason: "PDF has no selectable text. OCR extraction is still needed for scanned PDFs.",
          truncated: false,
          byteLength,
        };
      }
      return {
        supported: true,
        text,
        truncated: extracted.truncated,
        byteLength,
      };
    } catch (error) {
      return {
        supported: false,
        reason: error instanceof Error && error.message ? error.message : "Could not extract PDF text safely. PDF/OCR fallback is still needed for this file.",
        truncated: false,
        byteLength,
      };
    } finally {
      await parser?.destroy().catch(() => {});
    }
  }

  if (!isTextLikeDocument(mimetype, filename)) {
    return {
      supported: false,
      reason: "This document type is not text-extractable yet.",
      truncated: false,
      byteLength,
    };
  }

  const bytes = Buffer.from(input.data.buffer, input.data.byteOffset, Math.min(input.data.byteLength, maxBytes));
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  if (looksBinary(text)) {
    return {
      supported: false,
      reason: "The file looks binary, so text extraction was skipped.",
      truncated: false,
      byteLength,
    };
  }

  const extracted = limitText(normalizeText(text), maxTextChars);
  return {
    supported: true,
    text: extracted.text,
    truncated: byteLength > maxBytes || extracted.truncated,
    byteLength,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function limitText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, Math.max(0, maxChars)).trim(), truncated: true };
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function redactSensitiveText(value: string): string {
  return normalizeText(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (match) => {
      const digits = match.replace(/\D/g, "");
      if (/^\s*\+/.test(match) || /[\s().-]/.test(match)) return "[phone]";
      if (digits.length >= 10) return `********${digits.slice(-4)}`;
      if (digits.length >= 8) return "[phone]";
      return match;
    })
    .replace(/\b\d{10,}\b/g, (match) => `********${match.slice(-4)}`);
}

function safePreview(text: string | undefined, fallback: string): string {
  const redacted = redactSensitiveText(text?.trim() ? text : fallback);
  return redacted.length > 520 ? `${redacted.slice(0, 517)}...` : redacted;
}

function moneyValue(raw: string): string | undefined {
  const amount = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(amount)) return undefined;
  return `AUD ${amount.toFixed(2)}`;
}

function extractAmount(text: string): { label: "Amount due" | "Amount mentioned"; value: string } | undefined {
  const specific = text.match(
    /\b(amount\s+due|total\s+due|balance\s+due|early\s+exit\s+fee|exit\s+fee|fee|amount|total)\b[^A$0-9]{0,24}(?:A\$|AUD|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
  );
  const generic = specific ?? text.match(/(?:A\$|AUD|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i);
  if (!generic) return undefined;
  const value = moneyValue(generic[specific ? 2 : 1] ?? "");
  if (!value) return undefined;
  return {
    label: /due/i.test(generic[1] ?? "") ? "Amount due" : "Amount mentioned",
    value,
  };
}

function parseNamedDate(text: string, now: Date): string | undefined {
  const patterns = [
    /\b(?:due\s+date|due|pay\s+by)\s*:?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s*(\d{4})?/i,
    /\b(?:deadline|sign\s+by|respond\s+by|before)\s*:?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s*(\d{4})?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const day = Number(match[1]);
    const month = MONTHS[(match[2] ?? "").toLowerCase()];
    const year = match[3] ? Number(match[3]) : now.getFullYear();
    if (!Number.isInteger(day) || month === undefined || !Number.isInteger(year)) continue;
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) continue;
    return date.toISOString().slice(0, 10);
  }
  return undefined;
}

function firstUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0]?.replace(/[.,;!?]+$/, "");
}

function isSocialVideo(text: string, url?: string): boolean {
  const blob = `${text} ${url ?? ""}`.toLowerCase();
  return (
    /instagram\.com\/(?:reel|p)\//.test(blob) ||
    /tiktok\.com\//.test(blob) ||
    /youtube\.com\/watch/.test(blob) ||
    /youtu\.be\//.test(blob) ||
    /facebook\.com\/(?:reel|watch)/.test(blob) ||
    /\b(reel|short|tiktok|video hook|analyse this video|analyze this video)\b/.test(blob)
  );
}

function extractProvider(text: string): string | undefined {
  const match = text.match(
    /(?:^|[.!?\n]\s*)([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,5})\s+(?:electricity|energy|gas|water|internet|broadband)\s+bill\b/,
  );
  return match?.[1]?.trim();
}

function extractMaskedReference(text: string): string | undefined {
  const match = text.match(/\b(?:account|reference|ref|customer\s+number|invoice)\s*[:#-]?\s*([A-Z0-9 -]{6,30})\b/i);
  if (!match?.[1]) return undefined;
  const digits = match[1].replace(/\D/g, "");
  if (digits.length >= 6) return `********${digits.slice(-4)}`;
  const compact = match[1].replace(/\s+/g, "");
  return compact.length > 4 ? `********${compact.slice(-4)}` : compact;
}

function addFact(facts: KeyFact[], label: string, value: string | undefined, source: KeyFact["source"] = "extracted"): void {
  if (!value) return;
  if (facts.some((fact) => fact.label === label && fact.value === value)) return;
  facts.push({ label, value, source });
}

function isBill(text: string): boolean {
  return /\b(bill|invoice|amount\s+due|total\s+due|electricity|energy|gas|water|broadband|internet|kwh)\b/i.test(text);
}

function isContract(text: string): boolean {
  return /\b(contract|agreement|terms|termination|notice|early\s+exit\s+fee|sign\s+by|service\s+agreement)\b/i.test(text);
}

function isReceipt(text: string, mediaType?: LifeAdminIntakeInput["mediaType"]): boolean {
  return mediaType === "image" && /\b(receipt|tax invoice|merchant|subtotal|gst|paid)\b/i.test(text);
}

export function analyzeLifeAdminIntake(input: LifeAdminIntakeInput): LifeAdminIntakeResult {
  const now = input.now ?? new Date();
  const text = normalizeText(input.text ?? "");
  const filename = input.filename?.trim();
  const mimetype = input.mimetype?.trim();
  const fallback = [filename, mimetype, input.mediaType].filter(Boolean).join(" ");
  const preview = safePreview(text, fallback || "No text supplied.");
  const facts: KeyFact[] = [];
  const actions: SuggestedAction[] = [];
  const warnings: string[] = [];
  const url = firstUrl(text);

  if (url) addFact(facts, "URL", url);

  if (isSocialVideo(text, url)) {
    actions.push({
      kind: "analyze_social_video",
      label: "Analyze the social video",
      priority: "medium",
      reason: "A public social video link was provided.",
    });
    return {
      kind: "social_video",
      title: "Social video",
      confidence: url ? "high" : "medium",
      safePreview: preview,
      keyFacts: facts,
      suggestedActions: actions,
      warnings,
    };
  }

  const amount = extractAmount(text);
  const date = parseNamedDate(text, now);
  const reference = extractMaskedReference(text);
  const provider = extractProvider(text);

  if (isContract(text)) {
    addFact(facts, "Amount mentioned", amount?.value);
    addFact(facts, "Deadline", date);
    actions.push({
      kind: "review_contract",
      label: "Review important contract terms",
      priority: "high",
      reason: "The text contains contract or agreement language that can affect obligations.",
    });
    if (date) {
      actions.push({
        kind: "reminder",
        label: "Set a reminder for the deadline",
        priority: "medium",
        reason: "A date or deadline was found.",
      });
    }
    warnings.push("This is a summary helper, not legal advice.");
    return {
      kind: "contract",
      title: "Contract or agreement",
      confidence: "high",
      safePreview: preview,
      keyFacts: facts,
      suggestedActions: actions,
      warnings,
    };
  }

  if (isBill(text)) {
    const billTitle = /\b(electricity|energy|gas|kwh)\b/i.test(text) ? "Energy bill" : "Bill or invoice";
    addFact(facts, "Amount due", amount?.value);
    addFact(facts, "Due date", date);
    addFact(facts, "Provider", provider);
    addFact(facts, "Account/reference", reference);
    actions.push({
      kind: "compare_bill",
      label: "Compare this bill",
      priority: "high",
      reason: "Bills are high-value life admin items and can reveal savings or errors.",
    });
    if (date) {
      actions.push({
        kind: "reminder",
        label: "Set a payment reminder",
        priority: "high",
        reason: "A due date was found.",
      });
    }
    return {
      kind: "bill",
      title: billTitle,
      confidence: amount || date || provider ? "high" : "medium",
      safePreview: preview,
      keyFacts: facts,
      suggestedActions: actions,
      warnings,
    };
  }

  if (isReceipt(text, input.mediaType)) {
    addFact(facts, "Amount mentioned", amount?.value);
    actions.push({
      kind: "summarize",
      label: "Summarize the receipt",
      priority: "medium",
      reason: "The uploaded image looks like a receipt.",
    });
    return {
      kind: "receipt",
      title: "Receipt",
      confidence: "medium",
      safePreview: preview,
      keyFacts: facts,
      suggestedActions: actions,
      warnings,
    };
  }

  if (input.mediaType === "document" && !text) {
    if (filename) addFact(facts, "Filename", filename);
    if (mimetype) addFact(facts, "File type", mimetype);
    actions.push({
      kind: "extract_text",
      label: "Extract text from the document",
      priority: "high",
      reason: "Only document metadata is available right now; content extraction needs a PDF/OCR step.",
    });
    warnings.push("Document content was not extracted. PDF/OCR parsing still needs to be wired.");
    return {
      kind: "document",
      title: "Document received",
      confidence: "low",
      safePreview: preview,
      keyFacts: facts,
      suggestedActions: actions,
      warnings,
    };
  }

  actions.push({
    kind: "save_memory",
    label: "Save anything important",
    priority: "low",
    reason: "No bill, contract, deadline, or social video pattern was confidently detected.",
  });
  return {
    kind: "message",
    title: "Life admin note",
    confidence: "low",
    safePreview: preview,
    keyFacts: facts,
    suggestedActions: actions,
    warnings,
  };
}

export function registerLifeAdminIntake(registry: ToolRegistry): void {
  registry.register({
    name: "analyze_life_admin_intake",
    description:
      "Analyze user-provided bills, contracts, document text, public social video links, or life admin notes. Extract safe key facts, redact sensitive preview data, and suggest the next action without claiming unavailable OCR/PDF access.",
    inputSchema: z.object({
      text: z.string().optional(),
      mediaType: z.enum(["image", "voice", "document"]).optional(),
      filename: z.string().optional(),
      mimetype: z.string().optional(),
    }),
    handler: async (input: Omit<LifeAdminIntakeInput, "now">, ctx) =>
      analyzeLifeAdminIntake({
        ...input,
        now: ctx.now,
      }),
  });
}
