// Feature 17: Honest external integration capability map.
//
// These tools stop the assistant from claiming integrations that are not wired,
// permissioned, or legally safe yet. They also give the build agent a concrete
// next step per requested rail.

import { z } from "zod";
import type { ToolRegistry } from "../agent/tools.js";

export const integrationAreaSchema = z.enum([
  "email_sending",
  "drive_onedrive",
  "phone_sms",
  "bank_feeds",
  "google_photos",
  "facebook_birthdays",
  "social_video_analysis",
]);

export type IntegrationArea = z.infer<typeof integrationAreaSchema>;

export type IntegrationStatus = "available" | "partial" | "needs_setup" | "blocked";

export interface IntegrationCapability {
  area: IntegrationArea;
  title: string;
  status: IntegrationStatus;
  userPromise: string;
  availableNow: string[];
  needsSetup: string[];
  blockedBy: string[];
  safeMvp: string;
  nextBuildStep: string;
}

export const INTEGRATION_CAPABILITIES: Record<IntegrationArea, IntegrationCapability> = {
  email_sending: {
    area: "email_sending",
    title: "Email sending",
    status: "needs_setup",
    userPromise:
      "NitsyClaw can prepare email drafts now, but it must not send Gmail or Outlook messages until send scopes, re-auth, audit logging, and confirmation rails are wired.",
    availableNow: [
      "Gmail inbox search is read-only.",
      "Unread Gmail/Outlook summaries can be included in the morning brief when tokens are present.",
    ],
    needsSetup: [
      "Gmail send OAuth scope and user re-auth.",
      "Microsoft Graph Mail.Send permission and user/admin consent.",
      "A confirmation step before every external send.",
      "Audit logs that redact recipient/body secrets.",
    ],
    blockedBy: [],
    safeMvp:
      "Draft an email with recipients, subject, and body; queue a confirmation; only send after an explicit yes.",
    nextBuildStep:
      "Add a confirmation-gated send_email tool with provider-specific adapters and tests for missing scope, bad recipients, and duplicate confirmations.",
  },
  drive_onedrive: {
    area: "drive_onedrive",
    title: "Drive and OneDrive",
    status: "needs_setup",
    userPromise:
      "NitsyClaw can queue file search/import, but broad Drive or OneDrive access needs scoped OAuth and clear user consent.",
    availableNow: [],
    needsSetup: [
      "Google Drive OAuth scopes for selected/read-only files.",
      "Microsoft Graph Files.Read.Selected or equivalent least-privilege access.",
      "A file index that stores metadata only unless the user asks to import content.",
    ],
    blockedBy: [],
    safeMvp:
      "Let the user pick or paste a file/link, import that item, and answer questions from the selected content only.",
    nextBuildStep:
      "Build selected-file import first, then add a searchable metadata index for connected storage providers.",
  },
  phone_sms: {
    area: "phone_sms",
    title: "Phone calls and SMS",
    status: "needs_setup",
    userPromise:
      "NitsyClaw can draft call/SMS actions, but server-side phone/SMS needs a provider or phone companion app and legal consent.",
    availableNow: [],
    needsSetup: [
      "Twilio or another compliant SMS/calling provider, or an Android companion app.",
      "Verified sender numbers and regional messaging compliance.",
      "A confirmation step before calling or texting any person.",
    ],
    blockedBy: [
      "A web dashboard or WhatsApp bot cannot read iPhone call/SMS logs directly.",
      "Silent background calling/texting is not acceptable for a consumer assistant.",
    ],
    safeMvp:
      "Create call/SMS drafts and reminders; optionally send SMS through a verified provider after explicit confirmation.",
    nextBuildStep:
      "Implement draft_sms and queue_phone_call_request first, then add Twilio sending only after sender setup is complete.",
  },
  bank_feeds: {
    area: "bank_feeds",
    title: "Bank feeds and card transactions",
    status: "blocked",
    userPromise:
      "NitsyClaw must not connect to live bank feeds until an accredited open-banking provider, consent flow, and privacy controls are chosen.",
    availableNow: [
      "Receipt expense extraction is available from user-provided images.",
    ],
    needsSetup: [
      "Accredited open-banking/CDR provider or another compliant financial data aggregator.",
      "Consent records, deletion/export controls, and strict retention rules.",
      "Separate encryption and redaction policy for financial data.",
    ],
    blockedBy: [
      "Direct scraping or credential capture for bank accounts is not safe or release-grade.",
      "Financial transaction data is high-risk personal data.",
    ],
    safeMvp:
      "Support CSV/manual statement import and receipt matching before any live bank connection.",
    nextBuildStep:
      "Build a CSV transaction import with validation, deletion/export controls, and tests before evaluating open-banking providers.",
  },
  google_photos: {
    area: "google_photos",
    title: "Google Photos",
    status: "needs_setup",
    userPromise:
      "NitsyClaw can analyze photos the user selects, but broad library search needs Google Photos Picker/API setup and consent.",
    availableNow: [
      "Image receipt extraction exists for uploaded/user-provided images.",
    ],
    needsSetup: [
      "Google Photos Picker or Photos API configuration.",
      "Explicit user-selected media flow before analysis.",
      "Rules for faces, locations, children, and sensitive media.",
    ],
    blockedBy: [],
    safeMvp:
      "Let the user select photos, then summarize/search those selected photos by date, text, visible objects, and user-provided labels.",
    nextBuildStep:
      "Add selected-photo import and image-analysis metadata storage before any full-library behavior.",
  },
  facebook_birthdays: {
    area: "facebook_birthdays",
    title: "Facebook birthdays",
    status: "blocked",
    userPromise:
      "NitsyClaw can manage birthday templates and manual birthday lists, but it cannot promise Facebook birthday scraping or hidden profile access.",
    availableNow: [
      "Birthday message templates can be saved and listed.",
    ],
    needsSetup: [
      "A user-provided birthday source such as contacts/calendar import or manual list.",
      "Confirmation before sending birthday messages.",
    ],
    blockedBy: [
      "Facebook birthday access is restricted by platform permissions and user privacy settings.",
      "Scraping birthdays is not a reliable or trust-safe consumer product path.",
    ],
    safeMvp:
      "Import birthdays from contacts/calendar/CSV and use saved templates to draft messages for confirmation.",
    nextBuildStep:
      "Build manual/contact birthday import and birthday reminder drafts instead of Facebook scraping.",
  },
  social_video_analysis: {
    area: "social_video_analysis",
    title: "Social video analysis",
    status: "partial",
    userPromise:
      "NitsyClaw can analyze user-provided public links or uploaded screenshots/videos when accessible; platform APIs need setup for deeper metadata/comments.",
    availableNow: [
      "Public web research can summarize accessible public pages.",
      "User-provided screenshots/images can be analyzed through existing image-analysis patterns.",
    ],
    needsSetup: [
      "YouTube Data API for richer video/channel/comment metadata.",
      "Instagram/Meta app review and permissions for creator/business account media and comments.",
      "Upload/transcription pipeline for videos that are not publicly accessible.",
    ],
    blockedBy: [
      "Private or login-gated social content cannot be analyzed unless the user provides it or grants platform-approved access.",
    ],
    safeMvp:
      "Accept a public URL or uploaded file, extract visible/transcribed content, then produce a summary, hooks, CTA ideas, and follow-up actions.",
    nextBuildStep:
      "Add analyze_social_video_request that records URL/upload intent and returns provider-specific setup gaps.",
  },
};

function sortCapabilities(list: IntegrationCapability[]): IntegrationCapability[] {
  const statusRank: Record<IntegrationStatus, number> = {
    available: 0,
    partial: 1,
    needs_setup: 2,
    blocked: 3,
  };
  return [...list].sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.title.localeCompare(b.title));
}

export function registerIntegrationCapabilities(registry: ToolRegistry): void {
  registry.register({
    name: "list_integration_capabilities",
    description:
      "List the real status of requested external integrations. Use before answering whether NitsyClaw can send email, use Drive/OneDrive, send SMS, connect bank feeds, use Google Photos, use Facebook birthdays, or analyze social videos.",
    inputSchema: z.object({
      area: integrationAreaSchema.optional(),
    }),
    handler: async (input: { area?: IntegrationArea }) => {
      const capabilities = input.area
        ? [INTEGRATION_CAPABILITIES[input.area]]
        : sortCapabilities(Object.values(INTEGRATION_CAPABILITIES));
      return {
        count: capabilities.length,
        capabilities,
        rule:
          "Only call an integration live when status is available or partial and the requested action is listed in availableNow. For needs_setup or blocked, explain the setup/blocker and offer the safe MVP.",
      };
    },
  });
}

