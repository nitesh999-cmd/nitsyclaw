// Feature 17: Honest external integration capability map.
//
// These tools stop the assistant from claiming integrations that are not wired,
// permissioned, or legally safe yet. They also give the build agent a concrete
// next step per requested rail.

import { z } from "zod";
import type { ToolRegistry } from "../agent/tools.js";

export const integrationAreaSchema = z.enum([
  "calendar",
  "contacts_birthdays",
  "email_sending",
  "drive_onedrive",
  "phone_sms",
  "bank_feeds",
  "google_photos",
  "facebook_birthdays",
  "fuel_prices",
  "social_video_analysis",
  "spotify_music",
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
  calendar: {
    area: "calendar",
    title: "Google and Outlook Calendar",
    status: "partial",
    userPromise:
      "NitsyClaw can read calendar context where tokens exist and create confirmed calendar events through the existing approval rail, but each account must be connected and healthy.",
    availableNow: [
      "Morning brief can include calendar context when account tokens are present.",
      "Confirmed schedule-call flows can create calendar events through supported providers.",
      "queue_calendar_connection_request can capture missing account/setup work.",
    ],
    needsSetup: [
      "Verify Google Calendar OAuth token health.",
      "Verify Outlook/Microsoft Graph calendar token health.",
      "Expose account-by-account health on the Integrations page.",
    ],
    blockedBy: [],
    safeMvp:
      "Use connected calendars for brief/search and require confirmation before creating events.",
    nextBuildStep:
      "Add a calendar connection health endpoint and reconnect instructions per provider.",
  },
  contacts_birthdays: {
    area: "contacts_birthdays",
    title: "Contacts and birthdays",
    status: "needs_setup",
    userPromise:
      "NitsyClaw can plan birthday reminders and message drafts now, but importing contacts needs a user-selected source and clear consent.",
    availableNow: [
      "Birthday templates can be saved and listed.",
      "queue_birthday_import_request can capture contacts/calendar/CSV/manual birthday imports.",
      "queue_contacts_birthdays_import_request can capture broader contacts plus birthday context.",
    ],
    needsSetup: [
      "Choose first import source: Google Contacts, iPhone export, calendar, CSV, or manual list.",
      "Add review/delete controls for imported people.",
      "Require approval before any birthday message is sent.",
    ],
    blockedBy: [
      "Silent contact scraping is not acceptable for a consumer personal assistant.",
    ],
    safeMvp:
      "Import a CSV/manual list first, then draft reminders and birthday messages for approval.",
    nextBuildStep:
      "Build a contacts/birthdays import review flow with dedupe and delete controls.",
  },
  email_sending: {
    area: "email_sending",
    title: "Email sending",
    status: "partial",
    userPromise:
      "NitsyClaw can queue Gmail/Outlook draft creation for explicit approval now, but it must not send messages until send scopes, re-auth, and send adapters are wired.",
    availableNow: [
      "Gmail inbox search is read-only.",
      "Unread Gmail/Outlook summaries can be included in the morning brief when tokens are present.",
      "queue_email_draft_creation can prepare a draft request for explicit confirmation-id approval.",
    ],
    needsSetup: [
      "Gmail send OAuth scope and user re-auth.",
      "Microsoft Graph Mail.Send permission and user/admin consent.",
      "Provider draft creation adapters for Gmail/Outlook.",
      "A provider send adapter that executes only after a separate approved confirmation.",
    ],
    blockedBy: [],
    safeMvp:
      "Create a mailbox draft only after explicit confirmation-id approval; do not send.",
    nextBuildStep:
      "Add a confirmation-gated send_email tool with provider-specific adapters and tests for missing scope, bad recipients, and duplicate confirmations.",
  },
  drive_onedrive: {
    area: "drive_onedrive",
    title: "Drive and OneDrive",
    status: "needs_setup",
    userPromise:
      "NitsyClaw can queue selected-file import requests, but broad Drive or OneDrive access needs scoped OAuth and clear user consent.",
    availableNow: [
      "queue_storage_file_import_request can capture a selected file/link import request.",
    ],
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
    availableNow: [
      "prepare_sms_draft can produce copyable SMS text.",
      "queue_phone_call_request can capture a call prep/reminder request.",
    ],
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
      "queue_bank_csv_import_request can capture a CSV/manual statement import request.",
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
      "queue_google_photos_import_request can capture a selected-media import request.",
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
      "queue_birthday_import_request can capture contacts/calendar/CSV/manual import requests.",
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
  fuel_prices: {
    area: "fuel_prices",
    title: "Fuel prices and loyalty points",
    status: "needs_setup",
    userPromise:
      "NitsyClaw can capture a location-aware fuel-price request now, but live station prices need a reliable data source or public API per region.",
    availableNow: [
      "queue_fuel_price_request can capture suburb/postcode, fuel type, loyalty programs, and recommendation goal.",
      "General web research can help compare public fuel-price sources when the user asks.",
    ],
    needsSetup: [
      "Pick first geography and source: Victoria fuel API/public datasets, retailer feeds, or third-party fuel API.",
      "Define supported loyalty programs and how points are valued.",
      "Add freshness timestamp so recommendations do not look more precise than the data.",
    ],
    blockedBy: [
      "Without a live source, the assistant must not claim exact real-time station prices.",
    ],
    safeMvp:
      "Return a queued request with location, fuel type, loyalty preferences, and data-source gap; then connect one reliable data feed.",
    nextBuildStep:
      "Build a fuel data-source adapter for the first supported region and a recommendation scorer with freshness labels.",
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
      "queue_social_video_analysis_request can capture a public URL or upload analysis request.",
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
  spotify_music: {
    area: "spotify_music",
    title: "Spotify music assistant",
    status: "partial",
    userPromise:
      "NitsyClaw can use connected Spotify for top tracks, track search, and confirmation-gated private playlist creation when Spotify OAuth is connected.",
    availableNow: [
      "spotify_top_tracks reads connected listening taste.",
      "spotify_search_tracks finds tracks for playlist drafting.",
      "queue_spotify_playlist_creation creates a confirmation before making a private playlist.",
      "queue_spotify_music_request can capture music requests when connection/setup is not complete.",
    ],
    needsSetup: [
      "Spotify server env must be configured.",
      "User must connect Spotify OAuth before read/create tools work.",
    ],
    blockedBy: [],
    safeMvp:
      "Draft playlist ideas from search/top tracks and create playlists only after explicit confirmation.",
    nextBuildStep:
      "Add a richer WhatsApp music request shortcut that checks connection status before suggesting playlist creation.",
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
