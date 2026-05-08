const MANUAL_OPERATOR_INSTRUCTION_RE =
  /^\s*(?:[-*]\s*)?(?:run|open|type|kick off|to kick off|next:)?[\s\S]*(?:claude code|codex|openclaw|nwp)[\s\S]*$/i;

export function sanitizeUserFacingReply(text: string): string {
  const keptLines = text
    .split(/\r?\n/)
    .filter((line) => !MANUAL_OPERATOR_INSTRUCTION_RE.test(line));
  const cleaned = keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || "I have logged the request. The local operator workflow will handle build work after tests and commit.";
}
