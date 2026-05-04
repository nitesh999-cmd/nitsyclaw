// Feature 19: Safe request rails for permission-heavy integrations.
//
// These tools convert broad integration asks into structured build/user-action
// requests. They do not claim platform access, scrape private services, or send
// anything externally.

import { z } from "zod";
import { insertFeatureRequest } from "../db/repo.js";
import { hashPhone } from "../utils/crypto.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

function cleanOneLine(text: string, max = 500): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

async function queueIntegrationRequest(
  ctx: ToolContext,
  description: string,
  opts: {
    dedupePrefix: string;
    size?: "S" | "M" | "L";
    severity?: "P0" | "P1" | "P2" | "P3";
  },
) {
  const clean = cleanOneLine(description);
  const row = await insertFeatureRequest(ctx.deps.db, {
    description: clean,
    type: "feature",
    severity: opts.severity ?? "P2",
    size: opts.size ?? "M",
    source: "whatsapp",
    requestedBy: hashPhone(ctx.userPhone),
    dedupeKey: `${opts.dedupePrefix}:${clean.toLowerCase().slice(0, 140)}`,
    implementationNotes: "Queued through safe integration request rail; no live external access was claimed.",
  });
  return {
    queued: true,
    id: row.id,
    status: row.status,
    description: clean,
    instruction: "Queued for the next build run. This does not mean the external account is connected yet.",
  };
}

export function registerIntegrationRequests(registry: ToolRegistry): void {
  registry.register({
    name: "queue_storage_file_import_request",
    description:
      "Queue a user-selected Google Drive or OneDrive file import/search request. Does not scan broad storage.",
    inputSchema: z.object({
      provider: z.enum(["google_drive", "onedrive"]),
      fileNameOrLink: z.string().min(2).max(500).optional(),
      goal: z.string().min(3).max(500),
    }),
    handler: async (input: { provider: "google_drive" | "onedrive"; fileNameOrLink?: string; goal: string }, ctx) =>
      queueIntegrationRequest(
        ctx,
        `${input.provider} selected-file import request. File/link: ${input.fileNameOrLink ?? "not provided"}. Goal: ${input.goal}`,
        { dedupePrefix: input.provider, size: "M" },
      ),
  });

  registry.register({
    name: "queue_google_photos_import_request",
    description:
      "Queue a Google Photos selected-media import/search request. Does not claim broad photo library access.",
    inputSchema: z.object({
      mediaHint: z.string().min(2).max(500),
      dateRange: z.string().max(200).optional(),
      goal: z.string().min(3).max(500),
    }),
    handler: async (input: { mediaHint: string; dateRange?: string; goal: string }, ctx) =>
      queueIntegrationRequest(
        ctx,
        `Google Photos selected-media request. Media: ${input.mediaHint}. Date range: ${input.dateRange ?? "not provided"}. Goal: ${input.goal}`,
        { dedupePrefix: "google_photos", size: "M" },
      ),
  });

  registry.register({
    name: "prepare_sms_draft",
    description:
      "Prepare an SMS draft for the user to copy/send manually. Does not send SMS or access phone logs.",
    inputSchema: z.object({
      recipient: z.string().min(2).max(200),
      body: z.string().min(1).max(1000),
      purpose: z.string().max(300).optional(),
    }),
    handler: async (input: { recipient: string; body: string; purpose?: string }) => ({
      prepared: true,
      recipient: cleanOneLine(input.recipient, 200),
      body: input.body.trim().slice(0, 1000),
      purpose: input.purpose ? cleanOneLine(input.purpose, 300) : undefined,
      instruction: "Copy this into your SMS app. NitsyClaw has not sent it.",
    }),
  });

  registry.register({
    name: "queue_phone_call_request",
    description:
      "Queue a phone-call prep/reminder request. Does not place calls or access call logs.",
    inputSchema: z.object({
      contact: z.string().min(2).max(200),
      purpose: z.string().min(3).max(500),
      preferredTime: z.string().max(200).optional(),
    }),
    handler: async (input: { contact: string; purpose: string; preferredTime?: string }, ctx) =>
      queueIntegrationRequest(
        ctx,
        `Phone call prep request. Contact: ${input.contact}. Purpose: ${input.purpose}. Preferred time: ${input.preferredTime ?? "not provided"}`,
        { dedupePrefix: "phone_call", size: "S" },
      ),
  });

  registry.register({
    name: "queue_bank_csv_import_request",
    description:
      "Queue a CSV/manual bank statement import request. This is the safe first slice before live bank feeds.",
    inputSchema: z.object({
      bankOrCard: z.string().min(2).max(200).optional(),
      formatHint: z.string().max(300).optional(),
      goal: z.string().min(3).max(500),
    }),
    handler: async (input: { bankOrCard?: string; formatHint?: string; goal: string }, ctx) =>
      queueIntegrationRequest(
        ctx,
        `Bank CSV import request. Bank/card: ${input.bankOrCard ?? "not provided"}. Format: ${input.formatHint ?? "not provided"}. Goal: ${input.goal}`,
        { dedupePrefix: "bank_csv", size: "M", severity: "P1" },
      ),
  });

  registry.register({
    name: "queue_birthday_import_request",
    description:
      "Queue a birthday import/message workflow from contacts, calendar, CSV, or manual list. Does not scrape Facebook.",
    inputSchema: z.object({
      source: z.enum(["contacts", "calendar", "csv", "manual"]),
      goal: z.string().min(3).max(500),
    }),
    handler: async (input: { source: "contacts" | "calendar" | "csv" | "manual"; goal: string }, ctx) =>
      queueIntegrationRequest(
        ctx,
        `Birthday import request. Source: ${input.source}. Goal: ${input.goal}`,
        { dedupePrefix: "birthday_import", size: "M" },
      ),
  });

  registry.register({
    name: "queue_social_video_analysis_request",
    description:
      "Queue analysis of a public social video URL or user-provided upload. Does not access private/login-gated social accounts.",
    inputSchema: z.object({
      platform: z.enum(["youtube", "instagram", "facebook", "tiktok", "other"]),
      urlOrUploadHint: z.string().min(2).max(800),
      goal: z.string().min(3).max(500),
    }),
    handler: async (
      input: {
        platform: "youtube" | "instagram" | "facebook" | "tiktok" | "other";
        urlOrUploadHint: string;
        goal: string;
      },
      ctx,
    ) =>
      queueIntegrationRequest(
        ctx,
        `Social video analysis request. Platform: ${input.platform}. URL/upload: ${input.urlOrUploadHint}. Goal: ${input.goal}`,
        { dedupePrefix: "social_video", size: "M" },
      ),
  });
}

