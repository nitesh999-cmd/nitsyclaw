import {
  getProviderSetupReadiness,
  type ProviderSetupReadiness,
  type ProviderSetupSignals,
  type ProviderSetupStatus,
} from "@nitsyclaw/shared/integrations/provider-readiness";

export type WhatsAppProviderReadinessKey =
  | "gmail"
  | "outlook"
  | "drive"
  | "onedrive"
  | "google-photos"
  | "spotify"
  | "bank-feeds"
  | "phone-sms"
  | "birthdays"
  | "social-video";

export type WhatsAppProviderReadinessStatus = ProviderSetupStatus;

export interface WhatsAppProviderReadiness {
  key: WhatsAppProviderReadinessKey;
  label: string;
  status: WhatsAppProviderReadinessStatus;
  reason: string;
  nextStep: string;
  safety: string;
}

export type WhatsAppProviderRuntimeSignals = ProviderSetupSignals;

type EnvLike = Record<string, string | undefined>;

const PROVIDER_KEY_MAP: Record<string, WhatsAppProviderReadinessKey> = {
  gmail: "gmail",
  outlook: "outlook",
  drive: "drive",
  photos: "google-photos",
  spotify: "spotify",
  "bank-feeds": "bank-feeds",
  "phone-sms": "phone-sms",
  birthdays: "birthdays",
  "social-video": "social-video",
};

export function getWhatsAppProviderReadiness(
  env: EnvLike = process.env,
  signals: WhatsAppProviderRuntimeSignals = {},
): Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> {
  const dashboardReadiness = getProviderSetupReadiness(env, signals);
  const mapped = dashboardReadiness
    .filter((item) => item.key !== "calendar")
    .map(toWhatsAppProviderReadiness);
  const byKey = Object.fromEntries(mapped.map((item) => [item.key, item])) as Record<
    WhatsAppProviderReadinessKey,
    WhatsAppProviderReadiness
  >;

  const outlook = dashboardReadiness.find((item) => item.key === "outlook");
  byKey.onedrive = outlook
    ? {
        key: "onedrive",
        label: "OneDrive",
        status: outlook.status === "partial" ? "needs_adapter" : outlook.status === "needs_account" ? "needs_setup" : outlook.status,
        reason: outlook.status === "partial"
          ? "Microsoft token exists, but OneDrive selected-file adapter is not wired in WhatsApp."
          : "OneDrive has no connected Microsoft account in this runtime.",
        nextStep: outlook.status === "partial"
          ? "Add selected-file OneDrive adapter before browsing OneDrive from WhatsApp."
          : "Connect Microsoft OAuth and add selected-file OneDrive permissions.",
        safety: "Show filename/source before summarising private files.",
      }
    : {
        key: "onedrive",
        label: "OneDrive",
        status: "needs_setup",
        reason: "OneDrive setup status is unavailable.",
        nextStep: "Connect Microsoft OAuth and add selected-file OneDrive permissions.",
        safety: "Show filename/source before summarising private files.",
      };

  return byKey;
}

function toWhatsAppProviderReadiness(item: ProviderSetupReadiness): WhatsAppProviderReadiness {
  const key = PROVIDER_KEY_MAP[item.key];
  if (!key) {
    throw new Error(`Unsupported WhatsApp provider readiness key: ${item.key}`);
  }
  return {
    key,
    label: item.label,
    status: item.status,
    reason: item.summary,
    nextStep: item.nextStep,
    safety: item.safety,
  };
}

function statusLabel(status: WhatsAppProviderReadinessStatus): string {
  switch (status) {
    case "ready":
      return "ready";
    case "partial":
      return "partly ready";
    case "needs_account":
      return "needs account connection";
    case "needs_setup":
      return "needs setup";
    case "needs_adapter":
      return "needs adapter";
    case "approval_required":
      return "approval required";
    case "blocked":
      return "blocked";
  }
}

export function formatProviderReadinessLine(item: WhatsAppProviderReadiness): string {
  return `${item.label} (${statusLabel(item.status)}): ${item.reason} Next: ${item.nextStep} Safety: ${item.safety}`;
}

export function formatProviderReadinessShortLine(item: WhatsAppProviderReadiness): string {
  const detail = item.status === "partial" || item.status === "ready" ? item.reason : item.nextStep;
  return `${item.label}: ${statusLabel(item.status)} - ${clip(detail)}`;
}

function clip(value: string, max = 130): string {
  return value.length > max ? `${value.slice(0, max - 3).trim()}...` : value;
}
