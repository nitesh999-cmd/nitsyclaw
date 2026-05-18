// Feature 16: Personal context and product operations.
//
// Keeps common WhatsApp/dashboard assistant context in durable memory without
// adding a heavier profile schema until the product proves the need.

import { z } from "zod";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import { getProfileContext, insertFeatureRequest, listProfileContextForOwner, upsertProfileContext } from "../db/repo.js";
import type { PromptProfile, Surface } from "../agent/system-prompt.js";
import { hashPhone } from "../utils/crypto.js";
import type { DB } from "../db/client.js";
import type { ProfileContext } from "../db/schema.js";

const CURRENT_LOCATION_KEY = "current_location";
const HOME_LOCATION_KEY = "home_location";
const TIMEZONE_KEY = "timezone";
const DEFAULT_CURRENCY_KEY = "default_currency";
const REPLY_LANGUAGE_KEY = "reply_language";

function cleanOneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatLocation(input: {
  city: string;
  region?: string;
  country?: string;
}): string {
  return [input.city, input.region, input.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function parseExpiryHint(hint: string | undefined, now: Date): Date | undefined {
  if (!hint) return undefined;
  const normalized = hint.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "today") return endOfDay(addDays(now, 0));
  if (normalized === "tomorrow") return endOfDay(addDays(now, 1));
  if (normalized === "this week") return endOfDay(addDays(now, 7));
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = weekdays.indexOf(normalized);
  if (target >= 0) {
    const current = now.getUTCDay();
    const delta = (target - current + 7) % 7 || 7;
    return endOfDay(addDays(now, delta));
  }
  return undefined;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function endOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

async function setCurrentLocation(
  input: {
    city: string;
    region?: string;
    country?: string;
    expiresHint?: string;
    expiresAt?: string;
  },
  ctx: ToolContext,
) {
  const location = formatLocation(input);
  const expiresHint = input.expiresHint ? cleanOneLine(input.expiresHint) : undefined;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : parseExpiryHint(expiresHint, ctx.now);
  const row = await upsertProfileContext(ctx.deps.db, {
    ownerHash: hashPhone(ctx.userPhone),
    key: CURRENT_LOCATION_KEY,
    value: {
      location,
      city: input.city,
      region: input.region,
      country: input.country,
      expiresHint,
      setAt: ctx.now.toISOString(),
    },
    source: "manual",
    sensitivity: "personal",
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : undefined,
  });
  return {
    id: row.id,
    location,
    expiresHint,
    expiresAt: row.expiresAt?.toISOString(),
    message: expiresHint
      ? `Using ${location} until ${expiresHint}.`
      : `Using ${location} as the current location.`,
  };
}

async function setHomeLocation(
  input: {
    city: string;
    region?: string;
    country?: string;
  },
  ctx: ToolContext,
) {
  const location = formatLocation(input);
  const row = await upsertProfileContext(ctx.deps.db, {
    ownerHash: hashPhone(ctx.userPhone),
    key: HOME_LOCATION_KEY,
    value: {
      location,
      city: input.city,
      region: input.region,
      country: input.country,
      setAt: ctx.now.toISOString(),
    },
    source: "manual",
    sensitivity: "personal",
  });
  return {
    id: row.id,
    location,
    message: `Using ${location} as the home/default location.`,
  };
}

async function setProfilePreference(
  input: {
    key: "timezone" | "default_currency" | "reply_language";
    value: string;
  },
  ctx: ToolContext,
) {
  const value = cleanPreferenceValue(input.key, input.value);
  const row = await upsertProfileContext(ctx.deps.db, {
    ownerHash: hashPhone(ctx.userPhone),
    key: preferenceStorageKey(input.key),
    value: {
      value,
      setAt: ctx.now.toISOString(),
    },
    source: "manual",
    sensitivity: "personal",
  });
  return {
    id: row.id,
    key: input.key,
    value,
    message: `Saved ${input.key.replace("_", " ")} as ${value}.`,
  };
}

async function getCurrentLocation(_input: Record<string, never>, ctx: ToolContext) {
  const saved = await getProfileContext(ctx.deps.db, {
    ownerHash: hashPhone(ctx.userPhone),
    key: CURRENT_LOCATION_KEY,
  });
  const value = saved?.value as
    | { location?: string; expiresHint?: string; setAt?: string }
    | undefined;

  if (saved && value?.location && (!saved.expiresAt || saved.expiresAt.getTime() > ctx.now.getTime())) {
    return {
      location: value.location,
      expiresHint: value.expiresHint,
      expiresAt: saved.expiresAt?.toISOString(),
      setAt: value.setAt,
      source: "saved_current_location",
    };
  }

  const staleLocationIgnored = saved && value?.location && saved.expiresAt && saved.expiresAt.getTime() <= ctx.now.getTime()
    ? {
        location: value.location,
        expiredAt: saved.expiresAt.toISOString(),
        expiresHint: value.expiresHint,
      }
    : undefined;

  return {
    location:
      ctx.deps.profile?.currentLocation ??
      ctx.deps.profile?.homeLocation ??
      "Melbourne, Victoria, Australia",
    expiresHint: undefined,
    staleLocationIgnored,
    source: "profile_default",
  };
}

async function getPersonalContext(_input: Record<string, never>, ctx: ToolContext) {
  return resolvePromptProfileFromContext(ctx.deps.db, {
    userPhone: ctx.userPhone,
    now: ctx.now,
    fallback: ctx.deps.profile,
  });
}

async function reportProductBug(
  input: {
    description: string;
    severity?: "P0" | "P1" | "P2" | "P3";
    surface?: Surface | "both";
  },
  ctx: ToolContext,
) {
  const severity = input.severity ?? "P1";
  const surface = input.surface ?? "both";
  const row = await insertFeatureRequest(ctx.deps.db, {
    description: cleanOneLine(input.description),
    type: "bug",
    severity,
    size: severity === "P0" || severity === "P1" ? "M" : "S",
    source: surface === "dashboard" ? "dashboard" : "whatsapp",
    requestedBy: hashPhone(ctx.userPhone),
    dedupeKey: cleanOneLine(input.description).toLowerCase().slice(0, 160),
  });
  return {
    id: row.id,
    status: row.status,
    type: "bug",
    severity,
    surface,
  };
}

export function registerPersonalContext(registry: ToolRegistry): void {
  registry.register({
    name: "set_current_location",
    description:
      "Save the user's current/travel location for contextual answers like weather. Use when the user says they are in a city, travelling, wants weather for a city by default, or says to use a city temporarily. Do not use this to change home location unless they explicitly ask.",
    inputSchema: z.object({
      city: z.string().min(2),
      region: z.string().optional(),
      country: z.string().optional(),
      expiresHint: z
        .string()
        .optional()
        .describe("Natural expiry phrase such as 'Monday', 'this week', or 'until I say back home'."),
      expiresAt: z.string().optional().describe("Optional ISO expiry timestamp if known."),
    }),
    handler: setCurrentLocation,
  });

  registry.register({
    name: "set_home_location",
    description:
      "Save the user's home/default location. Use only when the user explicitly says this is their home, default, or permanent location.",
    inputSchema: z.object({
      city: z.string().min(2),
      region: z.string().optional(),
      country: z.string().optional(),
    }),
    handler: setHomeLocation,
  });

  registry.register({
    name: "set_profile_preference",
    description:
      "Save stable assistant preferences such as timezone, default currency, or reply language. Use when the user explicitly corrects these preferences.",
    inputSchema: z.object({
      key: z.enum(["timezone", "default_currency", "reply_language"]),
      value: z.string().min(2),
    }),
    handler: setProfilePreference,
  });

  registry.register({
    name: "get_current_location",
    description:
      "Resolve the user's current/default location for weather or local context. Use before weather requests when the user did not name a city in the same message.",
    inputSchema: z.object({}),
    handler: getCurrentLocation,
  });

  registry.register({
    name: "get_personal_context",
    description:
      "Return saved personal context for location, timezone, currency, and reply language. Use when the user asks what NitsyClaw knows or wants profile/status context.",
    inputSchema: z.object({}),
    handler: getPersonalContext,
  });

  registry.register({
    name: "report_product_bug",
    description:
      "Log a bug/problem with existing NitsyClaw behavior. Use for broken behavior, wrong answers, loops, failed tools, bad weather location, or regressions. Do not use for new feature ideas or reminders.",
    inputSchema: z.object({
      description: z.string().min(5),
      severity: z.enum(["P0", "P1", "P2", "P3"]).optional(),
      surface: z.enum(["whatsapp", "dashboard", "both"]).optional(),
    }),
    handler: reportProductBug,
  });
}

export const personalContextInternals = {
  CURRENT_LOCATION_KEY,
  HOME_LOCATION_KEY,
  TIMEZONE_KEY,
  DEFAULT_CURRENCY_KEY,
  REPLY_LANGUAGE_KEY,
};

export async function resolvePromptProfileFromContext(
  db: DB,
  args: {
    userPhone: string;
    now: Date;
    fallback?: PromptProfile;
  },
): Promise<PromptProfile> {
  const rows = await listProfileContextForOwner(db, hashPhone(args.userPhone), 50);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const homeLocation = readLocationRow(byKey.get(HOME_LOCATION_KEY)) ?? args.fallback?.homeLocation;
  const currentRow = byKey.get(CURRENT_LOCATION_KEY);
  const currentLocation = isFresh(currentRow, args.now)
    ? readLocationRow(currentRow)
    : undefined;

  return {
    homeLocation,
    currentLocation: currentLocation ?? args.fallback?.currentLocation ?? homeLocation,
    timezone: readPreferenceRow(byKey.get(TIMEZONE_KEY)) ?? args.fallback?.timezone,
    defaultCurrency: readPreferenceRow(byKey.get(DEFAULT_CURRENCY_KEY)) ?? args.fallback?.defaultCurrency,
    replyLanguage: readPreferenceRow(byKey.get(REPLY_LANGUAGE_KEY)) ?? args.fallback?.replyLanguage,
  };
}

function readLocationRow(row: ProfileContext | undefined): string | undefined {
  const value = row?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const location = (value as Record<string, unknown>).location;
  return typeof location === "string" && location.trim() ? cleanOneLine(location).slice(0, 120) : undefined;
}

function readPreferenceRow(row: ProfileContext | undefined): string | undefined {
  const value = row?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const saved = (value as Record<string, unknown>).value;
  return typeof saved === "string" && saved.trim() ? cleanOneLine(saved).slice(0, 80) : undefined;
}

function isFresh(row: ProfileContext | undefined, now: Date): boolean {
  return Boolean(row && (!row.expiresAt || row.expiresAt.getTime() > now.getTime()));
}

function preferenceStorageKey(key: "timezone" | "default_currency" | "reply_language"): string {
  switch (key) {
    case "timezone":
      return TIMEZONE_KEY;
    case "default_currency":
      return DEFAULT_CURRENCY_KEY;
    case "reply_language":
      return REPLY_LANGUAGE_KEY;
  }
}

function cleanPreferenceValue(key: "timezone" | "default_currency" | "reply_language", value: string): string {
  const cleaned = cleanOneLine(value);
  if (key === "default_currency") {
    const upper = cleaned.toUpperCase();
    if (!/^[A-Z]{3}$/.test(upper)) throw new Error("default_currency must be a 3-letter currency code");
    return upper;
  }
  if (key === "reply_language") return cleaned.slice(0, 40);
  return cleaned.slice(0, 80);
}
