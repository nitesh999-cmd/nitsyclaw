export const CHAT_MAX_BODY_BYTES = 128 * 1024;
export const CHAT_MAX_HISTORY_ITEMS = 50;
export const CHAT_MAX_MESSAGE_CHARS = 8_000;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatBody {
  history: ChatMessage[];
}

export interface ChatValidationOk {
  ok: true;
  body: ChatBody;
  last: ChatMessage;
}

export interface ChatValidationError {
  ok: false;
  status: number;
  reply: string;
}

export type ChatValidationResult = ChatValidationOk | ChatValidationError;

export function validateContentLength(header: string | null): ChatValidationError | null {
  if (!header) return null;
  const size = Number(header);
  if (!Number.isFinite(size) || size < 0) {
    return { ok: false, status: 400, reply: "Invalid Content-Length header" };
  }
  if (size > CHAT_MAX_BODY_BYTES) {
    return { ok: false, status: 413, reply: "Message is too large" };
  }
  return null;
}

export function validateChatBody(raw: unknown): ChatValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, reply: "Bad request" };
  }

  const history = (raw as { history?: unknown }).history;
  if (!Array.isArray(history) || history.length === 0) {
    return { ok: false, status: 400, reply: "No messages provided" };
  }
  if (history.length > CHAT_MAX_HISTORY_ITEMS) {
    return { ok: false, status: 400, reply: `Too many messages. Limit is ${CHAT_MAX_HISTORY_ITEMS}.` };
  }

  const messages: ChatMessage[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") {
      return { ok: false, status: 400, reply: "Invalid message format" };
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") {
      return { ok: false, status: 400, reply: "Invalid message role" };
    }
    if (typeof content !== "string") {
      return { ok: false, status: 400, reply: "Invalid message content" };
    }
    if (content.length > CHAT_MAX_MESSAGE_CHARS) {
      return { ok: false, status: 413, reply: `Message is too long. Limit is ${CHAT_MAX_MESSAGE_CHARS} characters.` };
    }
    messages.push({ role, content });
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return { ok: false, status: 400, reply: "Last message must be from user" };
  }
  if (last.content.trim().length === 0) {
    return { ok: false, status: 400, reply: "Message cannot be empty" };
  }

  return { ok: true, body: { history: messages }, last };
}
