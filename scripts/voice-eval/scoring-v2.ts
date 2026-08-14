import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { v1EditDistance } from "./scoring-v1.js";

export type TypedValueKind =
  | "integer"
  | "decimal"
  | "time"
  | "date"
  | "currency"
  | "phone"
  | "power"
  | "percentage"
  | "model"
  | "name"
  | "location"
  | "brand"
  | "relative_date";

type LexicalEquivalence = { canonical: string; forms: string[] };
type CriticalEntity = {
  id: string;
  type: TypedValueKind;
  canonical: string;
  forms: string[];
  rejectForms: string[];
};
type Intent = { id: string; forms: string[]; rejectForms: string[] };
export type VoiceSmokeV2Case = {
  id: string;
  reference: string;
  expectedLanguage: "english" | "hinglish";
  lexicalEquivalences: LexicalEquivalence[];
  criticalEntities: CriticalEntity[];
  intents: Intent[];
  expectedNegation: "present" | "absent";
};

type TypedEquivalenceFixture = {
  id: string;
  type: TypedValueKind;
  left: string;
  right: string;
  equal: boolean;
};
type TranscriptFixture = { id: string; caseId: string; transcript: string };
type VoiceSmokeV2Manifest = {
  schemaVersion: string;
  frozenOn: string;
  purpose: string;
  thresholds: {
    englishWerMax: number;
    hinglishWerMax: number;
    criticalEntityAccuracyMin: number;
    intentAccuracyMin: number;
    negationAccuracyMin: number;
    languageAccuracyMin: number;
    clipLatencyMsMax: number;
    cleanupRequired: boolean;
    confidenceRequiredForExternalAction: boolean;
  };
  safetyPolicy: Record<string, boolean>;
  cases: VoiceSmokeV2Case[];
  typedEquivalenceFixtures: TypedEquivalenceFixture[];
  positiveSafetyFixtures: TranscriptFixture[];
  adversarialSafetyFixtures: TranscriptFixture[];
};

export type VoiceSmokeV2Score = {
  caseId: string;
  rawTranscript: string;
  lexicalReference: string[];
  lexicalActual: string[];
  wordErrorRate: number;
  criticalEntities: Array<{
    id: string;
    canonical: string;
    matched: boolean;
    conflictingValueObserved: boolean;
    passed: boolean;
  }>;
  criticalEntityAccuracy: number;
  intents: Array<{
    id: string;
    matched: boolean;
    conflictingIntentObserved: boolean;
    passed: boolean;
  }>;
  intentAccuracy: number;
  negation: {
    expected: "present" | "absent";
    observed: "present" | "absent";
    correctionOrAmbiguityObserved: boolean;
    passed: boolean;
  };
  language: {
    expected: "english" | "hinglish";
    observed: "english" | "hindi" | "hinglish" | "unknown";
    script: "latin" | "devanagari" | "mixed" | "none";
    passed: boolean;
  };
  safetyPassed: boolean;
  lexicalPassed: boolean;
  confirmationRequired: boolean;
  providerConfidence: number | null;
  latencyMs: number | null;
  passed: boolean;
};

const SPEC_PATH = fileURLToPath(new URL("./voice-smoke-v2-spec.json", import.meta.url));
const SPEC_BYTES = readFileSync(SPEC_PATH);
const manifest = JSON.parse(SPEC_BYTES.toString("utf8")) as VoiceSmokeV2Manifest;

const SMALL_NUMBERS: Readonly<Record<string, number>> = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
});
const HINDI_NUMBERS: Readonly<Record<string, number>> = Object.freeze({
  "शून्य": 0, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5,
  "दस": 10, "पंद्रह": 15, "पन्द्रह": 15, "पचास": 50,
});
const SCALE_NUMBERS: Readonly<Record<string, number>> = Object.freeze({
  hundred: 100, thousand: 1_000, lakh: 100_000, lakhs: 100_000, crore: 10_000_000, crores: 10_000_000,
});
const MONTHS: Readonly<Record<string, number>> = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});

function words(value: string): string[] {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[-]/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function parseIntegerWords(value: string): number | null {
  const tokens = words(value).filter((token) => token !== "and");
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    const small = SMALL_NUMBERS[token] ?? HINDI_NUMBERS[token];
    if (small !== undefined) {
      current += small;
      continue;
    }
    const scale = SCALE_NUMBERS[token];
    if (scale === 100) {
      current = Math.max(current, 1) * scale;
      continue;
    }
    if (scale !== undefined) {
      total += Math.max(current, 1) * scale;
      current = 0;
      continue;
    }
    return null;
  }
  return total + current;
}

function normalizeDecimal(value: string): string | null {
  const compact = value.trim().replace(/\s+/gu, "");
  const validPlain = /^[+-]?\d+(?:\.\d+)?$/u.test(compact);
  const validWestern = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(compact);
  const validIndian = /^[+-]?\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/u.test(compact);
  if (!validPlain && !validWestern && !validIndian) return null;
  const sign = compact.startsWith("-") ? "-" : "";
  const unsigned = compact.replace(/^[+-]/u, "").replace(/,/gu, "");
  const [whole = "0", fractional = ""] = unsigned.split(".", 2);
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, "") || "0";
  const normalizedFraction = fractional.replace(/0+$/u, "");
  const zero = normalizedWhole === "0" && normalizedFraction.length === 0;
  return `${zero ? "" : sign}${normalizedWhole}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
}

function canonicalNumber(value: string): string | null {
  const numeric = normalizeDecimal(value);
  if (numeric !== null) return numeric;
  const normalized = value.normalize("NFC").toLowerCase().trim();
  const pointParts = normalized.split(/\s+point\s+/u);
  if (pointParts.length === 2) {
    const whole = parseIntegerWords(pointParts[0]!);
    const fractionTokens = words(pointParts[1]!);
    const digits: string[] = [];
    for (const token of fractionTokens) {
      const digit = SMALL_NUMBERS[token] ?? HINDI_NUMBERS[token];
      if (digit === undefined || digit > 9) return null;
      digits.push(String(digit));
    }
    return whole === null || digits.length === 0 ? null : normalizeDecimal(`${whole}.${digits.join("")}`);
  }
  const integer = parseIntegerWords(normalized);
  return integer === null ? null : String(integer);
}

function canonicalTime(value: string): string | null {
  const compact = value.normalize("NFKC").toLowerCase().replace(/\./gu, ".").trim();
  const numeric = compact.match(/^(\d{1,2})[:.](\d{2})\s*(a\s*m|p\s*m|am|pm)?$/u);
  let hour: number;
  let minute: number;
  let meridiem: string | undefined;
  if (numeric) {
    hour = Number(numeric[1]);
    minute = Number(numeric[2]);
    meridiem = numeric[3]?.replace(/\s+/gu, "");
  } else {
    const tokens = words(compact);
    if (tokens.length >= 2 && (tokens.at(-1) === "m") && (tokens.at(-2) === "a" || tokens.at(-2) === "p")) {
      meridiem = `${tokens.at(-2)}m`;
      tokens.splice(-2, 2);
    } else if (tokens.at(-1) === "am" || tokens.at(-1) === "pm") {
      meridiem = tokens.pop();
    }
    if (tokens.length !== 2) return null;
    const parsedHour = canonicalNumber(tokens[0]!);
    const parsedMinute = canonicalNumber(tokens[1]!);
    if (parsedHour === null || parsedMinute === null) return null;
    hour = Number(parsedHour);
    minute = Number(parsedMinute);
  }
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function canonicalDate(value: string): string | null {
  const normalized = value.normalize("NFKC").toLowerCase().trim();
  const auNumeric = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u);
  if (auNumeric) return validDate(Number(auNumeric[3]), Number(auNumeric[2]), Number(auNumeric[1]));
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/u);
  if (!named) return null;
  const month = MONTHS[named[2]!];
  return month === undefined ? null : validDate(Number(named[3]), month, Number(named[1]));
}

function canonicalCurrency(value: string): string | null {
  const normalized = value.normalize("NFKC").toLowerCase().trim();
  if (!/(?:\$|\baud\b|australian\s+dollars?)/u.test(normalized)) return null;
  const negative = /^\s*-/u.test(normalized) || /^\(.*\)$/u.test(normalized);
  const amount = normalized
    .replace(/[()]/gu, "")
    .replace(/australian\s+dollars?/gu, "")
    .replace(/\baud\b/gu, "")
    .replace(/\$/gu, "")
    .replace(/^[+-]/u, "")
    .trim();
  const canonical = canonicalNumber(amount);
  if (canonical === null) return null;
  return `AUD|${negative && canonical !== "0" ? "-" : ""}${canonical}`;
}

function canonicalPhone(value: string): string | null {
  const trimmed = value.normalize("NFKC").trim();
  if (!/^[+()\d\s-]+$/u.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/gu, "");
  if (/^0\d{9}$/u.test(digits)) digits = `61${digits.slice(1)}`;
  if (!/^61\d{9}$/u.test(digits)) return null;
  return `+${digits}`;
}

function canonicalPower(value: string): string | null {
  const normalized = value.normalize("NFKC").toLowerCase().trim();
  const match = normalized.match(/^(.+?)\s*(kilowatt(?:\s*hours?)?|kilowatts?|kwh|kw)$/u);
  if (!match) return null;
  const amount = canonicalNumber(match[1]!);
  if (amount === null) return null;
  const unit = /hour|kwh/u.test(match[2]!) ? "kwh" : "kw";
  return `${amount}|${unit}`;
}

function canonicalPercentage(value: string): string | null {
  const normalized = value.normalize("NFKC").toLowerCase().trim();
  const amount = normalized
    .replace(/%$/u, "")
    .replace(/\s*(?:percent|percentage|प्रतिशत)$/u, "")
    .trim();
  return canonicalNumber(amount);
}

function canonicalModel(value: string): string | null {
  const tokens = value.normalize("NFC").toUpperCase().match(/[\p{L}\p{M}\p{N}]+/gu);
  if (!tokens?.length) return null;
  return tokens.map((token) => {
    const lower = token.toLowerCase();
    const number = SMALL_NUMBERS[lower] ?? HINDI_NUMBERS[lower];
    return number === undefined ? token : String(number);
  }).join("");
}

function canonicalIdentity(value: string): string | null {
  const tokens = value.normalize("NFC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu);
  return tokens?.length ? tokens.join(" ") : null;
}

export function canonicalizeTypedValue(type: TypedValueKind, value: string): string | null {
  switch (type) {
    case "integer": return canonicalNumber(value)?.includes(".") ? null : canonicalNumber(value);
    case "decimal": return canonicalNumber(value);
    case "time": return canonicalTime(value);
    case "date": return canonicalDate(value);
    case "currency": return canonicalCurrency(value);
    case "phone": return canonicalPhone(value);
    case "power": return canonicalPower(value);
    case "percentage": return canonicalPercentage(value);
    case "model": return canonicalModel(value);
    case "name":
    case "location":
    case "brand":
    case "relative_date": return canonicalIdentity(value);
  }
}

function surfaceTokens(value: string, compatibility: boolean): string[] {
  const normalized = value.normalize(compatibility ? "NFKC" : "NFC").toLowerCase();
  return normalized.match(/[\p{L}\p{M}\p{N}]+(?:[.:/+_-][\p{L}\p{M}\p{N}]+)*|[$€£₹%]|[+-]/gu) ?? [];
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, offset) => haystack[index + offset] === token)) return true;
  }
  return false;
}

function lexicalTokens(testCase: VoiceSmokeV2Case, value: string): string[] {
  const tokens = surfaceTokens(value, true);
  const replacements = testCase.lexicalEquivalences.flatMap((equivalence) =>
    equivalence.forms.map((form) => ({ canonical: equivalence.canonical, tokens: surfaceTokens(form, true) })))
    .sort((left, right) => right.tokens.length - left.tokens.length);
  const output: string[] = [];
  for (let index = 0; index < tokens.length;) {
    const replacement = replacements.find((candidate) =>
      candidate.tokens.length > 0 && candidate.tokens.every((token, offset) => tokens[index + offset] === token));
    if (replacement) {
      output.push(replacement.canonical);
      index += replacement.tokens.length;
    } else {
      output.push(tokens[index]!);
      index += 1;
    }
  }
  return output;
}

function languageAndScript(value: string): {
  observed: "english" | "hindi" | "hinglish" | "unknown";
  script: "latin" | "devanagari" | "mixed" | "none";
} {
  const latin = (value.match(/\p{Script=Latin}/gu) ?? []).length;
  const devanagari = (value.match(/\p{Script=Devanagari}/gu) ?? []).length;
  const script = latin > 0 && devanagari > 0 ? "mixed" : devanagari > 0 ? "devanagari" : latin > 0 ? "latin" : "none";
  const tokenSet = new Set(surfaceTokens(value, true));
  const romanHindi = ["kal", "subah", "ko", "mein", "karna", "aur", "ka", "ke", "saath"];
  const englishLoan = ["call", "tesla", "powerwall", "quote", "discount", "check", "कॉल", "टेस्ला", "पावरवॉल", "कोट", "डिस्काउंट", "चेक"];
  const hasHindi = devanagari > 0 || romanHindi.some((token) => tokenSet.has(token));
  const hasEnglish = englishLoan.some((token) => tokenSet.has(token));
  if (hasHindi && hasEnglish) return { observed: "hinglish", script };
  if (hasHindi) return { observed: "hindi", script };
  if (latin > 0) return { observed: "english", script };
  return { observed: "unknown", script };
}

const NEGATION_MARKERS = new Set(["not", "no", "never", "dont", "don't", "cannot", "nahin", "nahi", "नहीं", "नही", "मत"]);
const CORRECTION_MARKERS = new Set(["actually", "correction", "sorry", "rather", "instead", "no", "बल्कि"]);
const NEGATION_CONTRACTION = /\b(?:don['’]?t|can['’]?t|won['’]?t|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|shouldn['’]?t|wouldn['’]?t|couldn['’]?t|mustn['’]?t)\b/iu;

export function getVoiceSmokeV2Manifest(): VoiceSmokeV2Manifest {
  return structuredClone(manifest);
}

export function getVoiceSmokeV2SpecHash(): string {
  return createHash("sha256").update(SPEC_BYTES).digest("hex");
}

export function getVoiceSmokeV2Case(caseId: string): VoiceSmokeV2Case {
  const testCase = manifest.cases.find((candidate) => candidate.id === caseId);
  if (!testCase) throw new Error(`Unknown frozen voice smoke case: ${caseId}`);
  return structuredClone(testCase);
}

export function scoreVoiceSmokeV2(input: {
  caseId: string;
  transcript: string;
  providerConfidence?: number | null;
  latencyMs?: number | null;
}): VoiceSmokeV2Score {
  const testCase = getVoiceSmokeV2Case(input.caseId);
  const rawTranscript = input.transcript;
  const lexicalReference = lexicalTokens(testCase, testCase.reference);
  const lexicalActual = lexicalTokens(testCase, rawTranscript);
  const wordErrorRate = lexicalReference.length === 0
    ? 0
    : v1EditDistance(lexicalReference, lexicalActual) / lexicalReference.length;
  const exactTokens = surfaceTokens(rawTranscript, false);

  const criticalEntities = testCase.criticalEntities.map((entity) => {
    const matched = entity.forms.some((form) => containsSequence(exactTokens, surfaceTokens(form, false)));
    const conflictingValueObserved = entity.rejectForms.some((form) => containsSequence(exactTokens, surfaceTokens(form, false)));
    return { id: entity.id, canonical: entity.canonical, matched, conflictingValueObserved, passed: matched && !conflictingValueObserved };
  });
  const criticalEntityAccuracy = criticalEntities.filter((entity) => entity.passed).length / criticalEntities.length;

  const intents = testCase.intents.map((intent) => {
    const matched = intent.forms.some((form) => containsSequence(exactTokens, surfaceTokens(form, false)));
    const conflictingIntentObserved = intent.rejectForms.some((form) => containsSequence(exactTokens, surfaceTokens(form, false)));
    return { id: intent.id, matched, conflictingIntentObserved, passed: matched && !conflictingIntentObserved };
  });
  const intentAccuracy = intents.filter((intent) => intent.passed).length / intents.length;

  const observedNegation = exactTokens.some((token) => NEGATION_MARKERS.has(token)) || NEGATION_CONTRACTION.test(rawTranscript)
    ? "present"
    : "absent";
  const correctionOrAmbiguityObserved = exactTokens.some((token) => CORRECTION_MARKERS.has(token));
  const negationPassed = observedNegation === testCase.expectedNegation && !correctionOrAmbiguityObserved;

  const detected = languageAndScript(rawTranscript);
  const languagePassed = detected.observed === testCase.expectedLanguage;
  const safetyPassed =
    criticalEntities.every((entity) => entity.passed) &&
    intents.every((intent) => intent.passed) &&
    negationPassed;
  const threshold = testCase.expectedLanguage === "english"
    ? manifest.thresholds.englishWerMax
    : manifest.thresholds.hinglishWerMax;
  const lexicalPassed = wordErrorRate <= threshold;
  const latencyMs = input.latencyMs ?? null;
  const latencyPassed = latencyMs === null || latencyMs <= manifest.thresholds.clipLatencyMsMax;
  const providerConfidence = input.providerConfidence ?? null;

  return {
    caseId: testCase.id,
    rawTranscript,
    lexicalReference,
    lexicalActual,
    wordErrorRate,
    criticalEntities,
    criticalEntityAccuracy,
    intents,
    intentAccuracy,
    negation: {
      expected: testCase.expectedNegation,
      observed: observedNegation,
      correctionOrAmbiguityObserved,
      passed: negationPassed,
    },
    language: { expected: testCase.expectedLanguage, ...detected, passed: languagePassed },
    safetyPassed,
    lexicalPassed,
    confirmationRequired: manifest.thresholds.confidenceRequiredForExternalAction && providerConfidence === null,
    providerConfidence,
    latencyMs,
    passed: safetyPassed && lexicalPassed && languagePassed && latencyPassed,
  };
}

export function validateVoiceSmokeV2Manifest(): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== "NITSYCLAW-VOICE-SMOKE-V2") errors.push("unexpected schema version");
  if (manifest.cases.length !== 2) errors.push("the smoke corpus must contain exactly two cases");
  if (new Set(manifest.cases.map((item) => item.id)).size !== manifest.cases.length) errors.push("duplicate case id");
  for (const testCase of manifest.cases) {
    for (const entity of testCase.criticalEntities) {
      const explicitlyMappedIdentity = new Set<TypedValueKind>(["name", "location", "brand", "model"]);
      if (!explicitlyMappedIdentity.has(entity.type)) {
        for (const form of entity.forms) {
          if (canonicalizeTypedValue(entity.type, form) !== entity.canonical) {
            errors.push(`${testCase.id}/${entity.id} accepted form does not produce canonical value: ${form}`);
          }
        }
      }
      for (const form of entity.rejectForms) {
        if (!explicitlyMappedIdentity.has(entity.type) && canonicalizeTypedValue(entity.type, form) === entity.canonical) {
          errors.push(`${testCase.id}/${entity.id} rejected form collapsed to canonical value: ${form}`);
        }
        if (entity.forms.some((accepted) => surfaceTokens(accepted, false).join("\u0000") === surfaceTokens(form, false).join("\u0000"))) {
          errors.push(`${testCase.id}/${entity.id} form is both accepted and rejected: ${form}`);
        }
      }
    }
  }
  return errors;
}

export const voiceSmokeV2Internals = {
  lexicalTokens,
  surfaceTokens,
  languageAndScript,
};
