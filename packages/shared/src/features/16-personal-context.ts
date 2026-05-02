// Feature 16: Personal context and product operations.
//
// Keeps common WhatsApp/dashboard assistant context in durable memory without
// adding a heavier profile schema until the product proves the need.

import { z } from "zod";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import { getProfileContext, insertFeatureRequest, upsertProfileContext } from "../db/repo.js";
import type { Surface } from "../agent/system-prompt.js";
import { hashPhone } from "../utils/crypto.js";

const CURRENT_LOCATION_KEY = "current_location";

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
      source: "saved_current_location",
    };
  }

  return {
    location:
      ctx.deps.profile?.currentLocation ??
      ctx.deps.profile?.homeLocation ??
      "Melbourne, Victoria, Australia",
    expiresHint: undefined,
    source: "profile_default",
  };
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
    name: "get_current_location",
    description:
      "Resolve the user's current/default location for weather or local context. Use before weather requests when the user did not name a city in the same message.",
    inputSchema: z.object({}),
    handler: getCurrentLocation,
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
};
