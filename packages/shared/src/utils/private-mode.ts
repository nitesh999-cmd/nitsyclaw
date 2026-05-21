const PRIVATE_MODE_PREFIXES = [
  "private:",
  "private mode:",
  "incognito:",
  "off the record:",
  "do not save:",
  "don't save:",
  "dont save:",
  "no memory:",
] as const;

const PRIVATE_MODE_HINT_RE = /\b(private mode|incognito|off the record|do not save|don't save|dont save|no memory)\b/i;

const PERSISTING_ACTION_RE = /\b(save|remember|remind|log|track|send|email|text|sms|call|delete|book|pay|buy|connect|upload|import|create event|calendar)\b/i;

export interface PrivateModeInput {
  privateMode: boolean;
  text: string;
  source: "prefix" | "flag";
}

export function parsePrivateModeInput(input: string, explicitPrivateMode = false): PrivateModeInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const prefix of PRIVATE_MODE_PREFIXES) {
    if (trimmed.toLowerCase().startsWith(prefix)) {
      const text = trimmed.slice(prefix.length).trim();
      return {
        privateMode: true,
        text: text || "Explain private mode.",
        source: "prefix",
      };
    }
  }

  if (explicitPrivateMode) {
    return {
      privateMode: true,
      text: trimmed,
      source: "flag",
    };
  }

  return null;
}

export function isPrivateModeHelpRequest(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return trimmed === "private mode" || trimmed === "incognito" || trimmed === "off the record";
}

export function formatPrivateModeHelp(): string {
  return [
    "Private mode",
    "Use: private: your question",
    "",
    "What happens:",
    "- I answer without saving the turn to chat history.",
    "- I do not add memories, reminders, expenses, feature rows, or command jobs.",
    "- I do not send, call, delete, book, pay, connect accounts, or change outside data.",
    "",
    "Example: private: help me rewrite this angry message calmly",
  ].join("\n");
}

export function formatPrivateModeActionBlocked(): string {
  return [
    "Private mode is on.",
    "I can answer or draft, but I will not save or take actions in private mode.",
    "",
    "Send it again without private mode if you want me to save, remind, log, send, call, delete, book, pay, or connect anything.",
  ].join("\n");
}

export function privateModeWouldPersist(input: string): boolean {
  return PERSISTING_ACTION_RE.test(input);
}

export function looksLikePrivateModeIntent(input: string): boolean {
  return PRIVATE_MODE_HINT_RE.test(input);
}
