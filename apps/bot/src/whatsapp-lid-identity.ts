// LID <-> phone identity resolution for WhatsApp "Message Yourself" chats.
//
// WhatsApp now addresses some self-chat events with an @lid recipient and an
// empty chat id, so the plain envelope cannot prove the message stayed in the
// owner's own chat. This module resolves the @lid back to a phone number via
// whatsapp-web.js `getContactLidAndPhone` and accepts ONLY when the resolved
// phone is exactly WHATSAPP_OWNER_NUMBER. Every other outcome fails closed.
//
// Never log or return raw lids/phone numbers from here.

import { normalizeWhatsAppOwnerId } from "./whatsapp-identity.js";

export const LID_CACHE_TTL_MS = 10 * 60 * 1000;
export const LID_CACHE_MAX_ENTRIES = 64;

export type LidPhoneRecord = { lid?: string | null; pn?: string | null };
export type LidPhoneLookup = (userIds: string[]) => Promise<LidPhoneRecord[] | undefined>;

export type LidSelfChatVerdict =
  | "accepted"
  | "rejected_identity"
  | "unresolved"
  | "not_candidate";

export interface LidSelfChatEnvelope {
  fromMe?: boolean;
  from: string;
  to: string;
  chatId?: string;
  ownerNumber: string;
}

function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isLidAddress(value: string): boolean {
  return normalizeAddress(value).endsWith("@lid");
}

function isNonPersonalAddress(value: string): boolean {
  const address = normalizeAddress(value);
  if (!address) return false;
  return (
    address.endsWith("@g.us") ||
    address.endsWith("@newsletter") ||
    address.endsWith("@broadcast") ||
    address === "status@broadcast"
  );
}

/**
 * Returns the @lid addresses that must resolve to the owner before an
 * owner-authored message can be treated as self-chat, or null when this
 * envelope is not a LID self-chat candidate at all.
 */
export function lidSelfChatTargets(args: LidSelfChatEnvelope): string[] | null {
  if (args.fromMe !== true) return null;

  const owner = normalizeWhatsAppOwnerId(args.ownerNumber);
  if (!owner) return null;

  const from = normalizeAddress(args.from);
  const to = normalizeAddress(args.to);
  const chatId = normalizeAddress(args.chatId);

  if (isNonPersonalAddress(from) || isNonPersonalAddress(to) || isNonPersonalAddress(chatId)) {
    return null;
  }

  // A known non-LID chat id is already decided by the plain envelope rules.
  if (chatId && !isLidAddress(chatId)) return null;

  const target = isLidAddress(chatId) ? chatId : isLidAddress(to) ? to : "";
  if (!target) return null;

  const targets = [target];
  if (isLidAddress(from)) {
    if (from !== target) targets.push(from);
  } else if (normalizeWhatsAppOwnerId(from) !== owner) {
    // Owner-authored message whose sender id is some other contact: fail closed.
    return null;
  }

  return targets;
}

export class LidPhoneResolver {
  private readonly cache = new Map<string, { phone: string; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly lookup: LidPhoneLookup,
    opts: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
  ) {
    this.ttlMs = opts.ttlMs ?? LID_CACHE_TTL_MS;
    this.maxEntries = opts.maxEntries ?? LID_CACHE_MAX_ENTRIES;
    this.now = opts.now ?? (() => Date.now());
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  /** Resolved phone digits for a @lid address, or "" when it cannot be resolved. */
  async resolvePhone(lid: string): Promise<string> {
    const key = normalizeAddress(lid);
    if (!isLidAddress(key)) return "";

    const cached = this.cache.get(key);
    if (cached) {
      if (cached.expiresAt > this.now()) return cached.phone;
      this.cache.delete(key);
    }

    let records: LidPhoneRecord[] | undefined;
    try {
      records = await this.lookup([key]);
    } catch {
      return "";
    }
    if (!Array.isArray(records) || records.length !== 1) return "";

    const record = records[0];
    if (!record || typeof record !== "object") return "";

    // If the provider echoes a different lid than requested, the mapping is
    // ambiguous - do not trust it.
    if (typeof record.lid === "string" && record.lid && normalizeAddress(record.lid) !== key) {
      return "";
    }

    const phone = normalizeWhatsAppOwnerId(typeof record.pn === "string" ? record.pn : "");
    if (!phone) return "";

    this.remember(key, phone);
    return phone;
  }

  private remember(key: string, phone: string): void {
    while (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
    this.cache.set(key, { phone, expiresAt: this.now() + this.ttlMs });
  }
}

export async function resolveLidSelfChat(
  resolver: Pick<LidPhoneResolver, "resolvePhone">,
  args: LidSelfChatEnvelope,
): Promise<LidSelfChatVerdict> {
  const targets = lidSelfChatTargets(args);
  if (!targets) return "not_candidate";

  const owner = normalizeWhatsAppOwnerId(args.ownerNumber);
  let unresolved = false;
  for (const target of targets) {
    const phone = await resolver.resolvePhone(target);
    if (!phone) {
      unresolved = true;
      continue;
    }
    if (phone !== owner) return "rejected_identity";
  }

  return unresolved ? "unresolved" : "accepted";
}
