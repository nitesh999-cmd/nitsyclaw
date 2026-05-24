// Feature 18: Confirmation-gated email drafts.
//
// This deliberately does not send email. It lets NitsyClaw prepare a draft and
// queue an approval record while provider send scopes/adapters are still being built.

import { z } from "zod";
import { insertConfirmation } from "../db/repo.js";
import { hashPhone } from "../utils/crypto.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

const emailAddressSchema = z.string().email().max(254);

export interface QueueEmailDraftInput {
  provider: "gmail" | "outlook";
  accountLabel?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}

function uniqueCleanEmails(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function cleanText(value: string, max: number): string {
  return value.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

function preview(value: string): string {
  const oneLine = cleanText(value, 200).replace(/\s+/g, " ");
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}...` : oneLine;
}

export async function queueEmailDraft(input: QueueEmailDraftInput, ctx: ToolContext) {
  const to = uniqueCleanEmails(input.to);
  const cc = uniqueCleanEmails(input.cc);
  const bcc = uniqueCleanEmails(input.bcc);
  const subject = cleanText(input.subject, 200);
  const body = input.body.trim();
  const accountLabel = input.accountLabel ? cleanText(input.accountLabel, 80) : undefined;
  const replyToMessageId = input.replyToMessageId ? cleanText(input.replyToMessageId, 200) : undefined;

  if (!to.length) return { queued: false, error: "At least one recipient is required." };
  if (!subject) return { queued: false, error: "Subject is required." };
  if (!body) return { queued: false, error: "Body is required." };

  const expiresAt = new Date(ctx.now.getTime() + 15 * 60 * 1000);
  const row = await insertConfirmation(
    ctx.deps.db,
    privateOwnerTenantForPhone(ctx.userPhone),
    "email_create_draft",
    {
      provider: input.provider,
      accountLabel,
      to,
      cc,
      bcc,
      subject,
      body,
      replyToMessageId,
      ownerHash: hashPhone(ctx.userPhone),
      createdFrom: "queue_email_draft_creation",
    },
    expiresAt,
  );

  return {
    queued: true,
    confirmationId: row.id,
    action: "email_create_draft",
    provider: input.provider,
    recipientCount: to.length + cc.length + bcc.length,
    toCount: to.length,
    ccCount: cc.length,
    bccCount: bcc.length,
    subjectPreview: preview(subject),
    bodyPreview: preview(body),
    expiresAt: expiresAt.toISOString(),
    instruction: `Reply yes ${row.id} to create this email draft, or no ${row.id} to cancel. This creates a draft only; it does not send.`,
  };
}

export function registerEmailDrafts(registry: ToolRegistry): void {
  registry.register({
    name: "queue_email_draft_creation",
    description:
      "Prepare an email draft creation request and queue it for approval by confirmation id. This creates a draft only after approval; it never sends email.",
    inputSchema: z.object({
      provider: z.enum(["gmail", "outlook"]),
      accountLabel: z.string().max(80).optional(),
      to: z.array(emailAddressSchema).min(1).max(20),
      cc: z.array(emailAddressSchema).max(20).optional(),
      bcc: z.array(emailAddressSchema).max(20).optional(),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(10_000),
      replyToMessageId: z.string().max(200).optional(),
    }),
    handler: queueEmailDraft,
  });
}
