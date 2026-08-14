import type { VoiceEvidenceSpan, VoiceUnicodeAssessment } from "./types.js";

const BIDI_CODE_POINTS = new Set([
  0x061c,
  0x200e,
  0x200f,
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
]);

function span(text: string, start: number, end: number): VoiceEvidenceSpan {
  return { start, end, text: text.slice(start, end) };
}

function scriptsIn(token: string): string[] {
  const scripts: string[] = [];
  if (/\p{Script=Latin}/u.test(token)) scripts.push("latin");
  if (/\p{Script=Devanagari}/u.test(token)) scripts.push("devanagari");
  if (/\p{Script=Cyrillic}/u.test(token)) scripts.push("cyrillic");
  if (/\p{Script=Greek}/u.test(token)) scripts.push("greek");
  return scripts;
}

export function inspectVoiceUnicode(text: string): VoiceUnicodeAssessment {
  const normalized = text.normalize("NFC");
  const issues: VoiceUnicodeAssessment["issues"] = [];

  for (let index = 0; index < normalized.length;) {
    const codePoint = normalized.codePointAt(index)!;
    const char = String.fromCodePoint(codePoint);
    const end = index + char.length;
    if (BIDI_CODE_POINTS.has(codePoint)) {
      issues.push({ kind: "bidi", span: span(normalized, index, end) });
    } else if (/\p{Cs}/u.test(char)) {
      issues.push({ kind: "surrogate", span: span(normalized, index, end) });
    } else if (/\p{Cc}/u.test(char)) {
      issues.push({ kind: "control", span: span(normalized, index, end) });
    } else if (/\p{Cf}/u.test(char)) {
      issues.push({ kind: "format", span: span(normalized, index, end) });
    } else if (char.normalize("NFKC") !== char.normalize("NFC")) {
      issues.push({ kind: "compatibility", span: span(normalized, index, end) });
    } else if (/[\u0334-\u0338]/u.test(char)) {
      issues.push({ kind: "combining_mark", span: span(normalized, index, end) });
    }
    index = end;
  }

  for (const match of normalized.matchAll(/[\p{L}\p{M}\p{N}'’_-]+/gu)) {
    const token = match[0];
    const tokenScripts = scriptsIn(token);
    if (tokenScripts.length > 1) {
      const start = match.index ?? 0;
      issues.push({ kind: "mixed_script_token", span: span(normalized, start, start + token.length) });
    }
  }

  return { safe: issues.length === 0, normalized, issues };
}
