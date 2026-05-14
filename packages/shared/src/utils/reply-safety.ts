const MANUAL_OPERATOR_INSTRUCTION_RE =
  /^\s*(?:[-*]\s*)?(?:run|open|type|kick off|to kick off|next:)?[\s\S]*(?:claude code|codex|openclaw|nwp)[\s\S]*$/i;
const NOISY_RECEIPT_LINE_RE = /^\s*(?:saved\.\s*)?working\s+on\s+it\.?\s*$/i;

export function sanitizeUserFacingReply(text: string): string {
  const keptLines = text
    .split(/\r?\n/)
    .filter((line) => !MANUAL_OPERATOR_INSTRUCTION_RE.test(line))
    .filter((line) => !NOISY_RECEIPT_LINE_RE.test(line));
  const cleaned = keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned) return cleaned;
  return text
    .split(/\r?\n/)
    .some((line) => NOISY_RECEIPT_LINE_RE.test(line))
    ? ""
    : "I have logged the request. The local operator workflow will handle build work after tests and commit.";
}
