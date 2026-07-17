import { readFile, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const CALIBRATION_FILE = "self-chat-allowlist.json";
export const SELF_CHAT_CALIBRATION_PHRASE = "nitsyclaw calibrate self chat";

type SelfChatAllowlistFile = {
  allowedChatIds?: string[];
  updatedAt?: string;
};

export function normalizeWhatsAppAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function selfChatAllowlistPath(sessionDir: string): string {
  return join(sessionDir, CALIBRATION_FILE);
}

export async function readAllowedSelfChatIds(sessionDir: string): Promise<string[]> {
  try {
    const raw = await readFile(selfChatAllowlistPath(sessionDir), "utf8");
    const parsed = JSON.parse(raw) as SelfChatAllowlistFile;
    return Array.isArray(parsed.allowedChatIds)
      ? parsed.allowedChatIds.map(normalizeWhatsAppAddress).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export async function allowSelfChatId(sessionDir: string, chatId: string): Promise<string[]> {
  const normalized = normalizeWhatsAppAddress(chatId);
  if (!normalized.endsWith("@lid")) return readAllowedSelfChatIds(sessionDir);
  const existing = await readAllowedSelfChatIds(sessionDir);
  const allowedChatIds = [...new Set([...existing, normalized])];
  const path = selfChatAllowlistPath(sessionDir);
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ allowedChatIds, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return allowedChatIds;
}

export function isSelfChatCalibrationPhrase(body: string): boolean {
  return body.trim().toLowerCase() === SELF_CHAT_CALIBRATION_PHRASE;
}
