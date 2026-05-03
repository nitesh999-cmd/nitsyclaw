import { hashPhone, encryptForStorage } from "@nitsyclaw/shared/utils";

export interface OwnerIdentity {
  ownerPhone: string;
  ownerHash: string;
}

export function getOwnerIdentity(env: NodeJS.ProcessEnv = process.env): OwnerIdentity {
  const ownerPhone = env.WHATSAPP_OWNER_NUMBER?.trim();
  if (!ownerPhone) {
    throw new Error("WHATSAPP_OWNER_NUMBER is not configured");
  }
  return { ownerPhone, ownerHash: hashPhone(ownerPhone) };
}

export function encryptDashboardText(text: string, env: NodeJS.ProcessEnv = process.env): string {
  return encryptForStorage(text, env);
}

export function publicConfigError(error: unknown): { reply: string; status: number } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("WHATSAPP_OWNER_NUMBER")) {
    return { reply: "Dashboard owner identity is not configured.", status: 503 };
  }
  if (message.includes("ENCRYPTION_KEY")) {
    return { reply: "Dashboard encryption is not configured.", status: 503 };
  }
  return { reply: "Dashboard configuration is incomplete.", status: 503 };
}
