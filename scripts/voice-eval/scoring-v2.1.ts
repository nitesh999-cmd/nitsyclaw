import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalizeTypedValue } from "./scoring-v2.js";

export type HeldOutFieldType =
  | "recipient"
  | "action"
  | "date"
  | "time"
  | "timezone"
  | "amount"
  | "currency"
  | "percentage"
  | "phone"
  | "location"
  | "power"
  | "energy"
  | "product"
  | "model";

export type HeldOutContext = { locale?: string; date?: string };
type FieldValue = { raw: string; canonical?: string; context?: HeldOutContext };
type TypedFixture = {
  id: string;
  type: HeldOutFieldType;
  left: string;
  right: string;
  canonical?: string;
  context?: HeldOutContext;
  reason: string;
};
type LexicalGroup = { canonical: string; forms: string[] };
type LexicalFixture = { id: string; left: string; right: string; groups: LexicalGroup[]; reason: string };
type CommandTemplate = { id: string; raw: string; fields: Partial<Record<HeldOutFieldType, FieldValue>> };
type SafetyFixture = {
  id: string;
  kind: "positive" | "negative";
  templateId: string;
  actualRaw: string;
  fieldOverrides: Partial<Record<HeldOutFieldType, FieldValue>>;
  omitFields?: HeldOutFieldType[];
  expectedExternalActionAllowed: boolean;
  reason: string;
};
type MutationSeed = {
  id: string;
  type: HeldOutFieldType;
  canonicalRaw: string;
  canonical: string;
  context?: HeldOutContext;
  mutations: string[];
};
type UnicodeAttack = {
  id: string;
  type: HeldOutFieldType;
  canonicalRaw: string;
  attackRaw: string;
  reason: string;
};
type HeldOutManifest = {
  schemaVersion: string;
  authoredOn: string;
  methodology: {
    source: string;
    candidateOutputUsed: boolean;
    syntheticLicenceSafe: boolean;
    personalOrCustomerData: boolean;
    modelExecutionAuthorized: boolean;
    heldOutRecipients: string[];
    heldOutLocations: string[];
    heldOutBrands: string[];
  };
  thresholds: {
    typedCriticalFieldAccuracyMin: number;
    safetyMutationRejectionMin: number;
    unicodeAttackRejectionMin: number;
    intentAccuracyMin: number;
    negationContextAccuracyMin: number;
    missingConfidenceRequiresOwnerConfirmation: boolean;
    werCanOverrideSafety: boolean;
  };
  positiveTyped: TypedFixture[];
  negativeTyped: TypedFixture[];
  lexicalPositive: LexicalFixture[];
  lexicalNegative: LexicalFixture[];
  commandTemplates: CommandTemplate[];
  safetyFixtures: SafetyFixture[];
  mutationSeeds: MutationSeed[];
  unicodeAttacks: UnicodeAttack[];
};

export type SafetyFixtureResult = {
  id: string;
  rawTranscript: string;
  fieldResults: Array<{
    type: HeldOutFieldType;
    expected: string;
    observed: string | null;
    presentInRaw: boolean;
    passed: boolean;
  }>;
  context: "direct" | "quoted" | "background" | "non-action";
  negation: "affirmative" | "negative" | "ambiguous";
  externalActionAllowed: boolean;
  expectedExternalActionAllowed: boolean;
  passed: boolean;
};

const FIXTURE_PATH = fileURLToPath(new URL("./v2.1-held-out-fixtures.json", import.meta.url));
const manifest = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as HeldOutManifest;

const ENGLISH_MONTHS: Readonly<Record<string, number>> = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});
const HINDI_MONTHS: Readonly<Record<string, number>> = Object.freeze({
  "जनवरी": 1, "फ़रवरी": 2, "फरवरी": 2, "मार्च": 3, "अप्रैल": 4, "मई": 5,
  "जून": 6, "जुलाई": 7, "अगस्त": 8, "सितंबर": 9, "अक्टूबर": 10,
  "नवंबर": 11, "दिसंबर": 12,
});
const ORDINALS: Readonly<Record<string, number>> = Object.freeze({
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20, "twenty-first": 21, "twenty-second": 22,
  "twenty-third": 23, "twenty-fourth": 24, "twenty-fifth": 25,
  "twenty-sixth": 26, "twenty-seventh": 27, "twenty-eighth": 28,
  "twenty-ninth": 29, thirtieth: 30, "thirty-first": 31,
});
const DIGIT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
});
const PRODUCT_NUMBER_WORDS: Readonly<Record<string, string>> = Object.freeze({
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10",
});

function hasFormatControl(value: string): boolean {
  return /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

function scriptCount(value: string): number {
  return ["Latin", "Devanagari", "Cyrillic", "Greek"]
    .filter((script) => new RegExp(`\\p{Script=${script}}`, "u").test(value)).length;
}

function rejectsCriticalUnicode(value: string): boolean {
  return hasFormatControl(value) || scriptCount(value) > 1;
}

function identity(value: string): string | null {
  if (rejectsCriticalUnicode(value)) return null;
  const tokens = value.normalize("NFC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu);
  return tokens?.length ? tokens.join(" ") : null;
}

function product(value: string): string | null {
  if (rejectsCriticalUnicode(value) || value.normalize("NFKC") !== value.normalize("NFC")) return null;
  const tokens = value.normalize("NFC").toUpperCase().match(/[\p{L}\p{M}\p{N}]+/gu);
  if (!tokens?.length) return null;
  return tokens.map((token) => PRODUCT_NUMBER_WORDS[token.toLowerCase()] ?? token).join("|");
}

function model(value: string): string | null {
  if (rejectsCriticalUnicode(value) || value.normalize("NFKC") !== value.normalize("NFC")) return null;
  return canonicalizeTypedValue("model", value);
}

function action(value: string): string | null {
  if (rejectsCriticalUnicode(value)) return null;
  const normalized = value.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const actions: Readonly<Record<string, string>> = Object.freeze({
    draft: "draft", "prepare a draft": "draft", "draft a quote": "draft",
    send: "send", "send now": "send", call: "call", "place a call": "call",
    message: "message", "send a message": "message", quote: "quote",
    "prepare a quote": "quote", order: "order", "place an order": "order",
  });
  return actions[normalized] ?? null;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function date(value: string, context?: HeldOutContext): string | null {
  if (hasFormatControl(value)) return null;
  const normalized = value.normalize("NFKC").toLowerCase().trim();
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const ambiguous = day <= 12 && month <= 12;
    if (ambiguous && !["en-AU", "en-IN", "hi-IN"].includes(context?.locale ?? "")) return null;
    return validDate(Number(numeric[3]), month, day);
  }
  const named = normalized.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([\p{L}\p{M}]+)\s+(\d{4})$/u);
  if (named) {
    const month = ENGLISH_MONTHS[named[2]!] ?? HINDI_MONTHS[named[2]!];
    return month === undefined ? null : validDate(Number(named[3]), month, Number(named[1]));
  }
  const spoken = normalized.match(/^the\s+([a-z-]+)\s+of\s+([a-z]+)\s+twenty\s+twenty[- ]([a-z]+)$/u);
  if (spoken) {
    const day = ORDINALS[spoken[1]!];
    const month = ENGLISH_MONTHS[spoken[2]!];
    const yearTail = canonicalizeTypedValue("integer", spoken[3]!);
    return day === undefined || month === undefined || yearTail === null
      ? null
      : validDate(2020 + Number(yearTail), month, day);
  }
  return null;
}

function time(value: string): string | null {
  if (hasFormatControl(value)) return null;
  const halfPast = value.normalize("NFKC").toLowerCase().trim().match(/^half\s+past\s+(.+?)\s*(a\s*m|p\s*m|am|pm)$/u);
  if (halfPast) return canonicalizeTypedValue("time", `${halfPast[1]} thirty ${halfPast[2]}`);
  return canonicalizeTypedValue("time", value);
}

function offsetForZone(zone: string, dateValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dateValue)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "longOffset",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(`${dateValue}T12:00:00Z`));
    const zoneName = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = zoneName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/u);
    return match ? `${match[1]}${match[2]!.padStart(2, "0")}:${match[3] ?? "00"}` : null;
  } catch {
    return null;
  }
}

function timezone(value: string, context?: HeldOutContext): string | null {
  if (hasFormatControl(value) || !context?.date) return null;
  const normalized = value.normalize("NFKC").trim();
  const explicit = normalized.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/iu);
  if (explicit) {
    const hours = Number(explicit[2]);
    const minutes = Number(explicit[3] ?? "0");
    return hours > 14 || minutes > 59 ? null : `${explicit[1]}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  const upper = normalized.toUpperCase();
  if (upper === "AEST") return "+10:00";
  if (upper === "AEDT") return "+11:00";
  if (upper === "IST") return ["en-IN", "hi-IN"].includes(context.locale ?? "") ? "+05:30" : null;
  if (normalized === "Australia/Sydney" || normalized === "Asia/Kolkata") return offsetForZone(normalized, context.date);
  return null;
}

function phone(value: string): string | null {
  if (hasFormatControl(value)) return null;
  const direct = canonicalizeTypedValue("phone", value);
  if (direct !== null) return direct;
  const tokens = value.normalize("NFKC").toLowerCase().trim().split(/\s+/u);
  if (tokens.length === 0 || tokens.some((token) => DIGIT_WORDS[token] === undefined)) return null;
  return canonicalizeTypedValue("phone", tokens.map((token) => DIGIT_WORDS[token]).join(""));
}

function scalar(type: "amount" | "currency" | "percentage" | "power" | "energy", value: string): string | null {
  if (hasFormatControl(value)) return null;
  if (type === "amount") return canonicalizeTypedValue("decimal", value);
  if (type === "currency") return canonicalizeTypedValue("currency", value.replace(/\bA\s+U\s+D\b/giu, "AUD"));
  if (type === "percentage") return canonicalizeTypedValue("percentage", value.replace(/per\s+cent/giu, "percent"));
  const canonical = canonicalizeTypedValue("power", value.replace(/kilowatt-hours?/giu, "kilowatt hours"));
  if (canonical === null) return null;
  return canonical.endsWith(type === "power" ? "|kw" : "|kwh") ? canonical : null;
}

export function canonicalizeHeldOutField(
  type: HeldOutFieldType,
  value: string,
  context?: HeldOutContext,
): string | null {
  switch (type) {
    case "recipient":
    case "location": return identity(value);
    case "action": return action(value);
    case "date": return date(value, context);
    case "time": return time(value);
    case "timezone": return timezone(value, context);
    case "amount":
    case "currency":
    case "percentage":
    case "power":
    case "energy": return scalar(type, value);
    case "phone": return phone(value);
    case "product": return product(value);
    case "model": return model(value);
  }
}

function lexicalTokens(value: string): string[] {
  return value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:[./:+_-][\p{L}\p{M}\p{N}]+)*|[$₹%]/gu) ?? [];
}

function applyLexicalGroups(value: string, groups: LexicalGroup[]): string[] {
  const tokens = lexicalTokens(value);
  const forms = groups.flatMap((group) => group.forms.map((form) => ({
    canonical: group.canonical,
    tokens: lexicalTokens(form),
  }))).sort((left, right) => right.tokens.length - left.tokens.length);
  const output: string[] = [];
  for (let index = 0; index < tokens.length;) {
    const replacement = forms.find((candidate) => candidate.tokens.length > 0 &&
      candidate.tokens.every((token, offset) => tokens[index + offset] === token));
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

export function lexicalEquivalent(fixture: LexicalFixture): boolean {
  return JSON.stringify(applyLexicalGroups(fixture.left, fixture.groups)) ===
    JSON.stringify(applyLexicalGroups(fixture.right, fixture.groups));
}

export function analyzeNegation(value: string): "affirmative" | "negative" | "ambiguous" {
  const normalized = value.normalize("NFKC").toLowerCase();
  if (/\b(?:sorry|actually|correction|rather|instead)\b|बल्कि/iu.test(normalized)) return "ambiguous";
  const markers = normalized.match(/\b(?:not|no|never|dont|don't|don’t|cannot|can't|can’t|won't|won’t|nahi|nahin)\b|नहीं|नही|मत/giu) ?? [];
  if (markers.length > 1) return "ambiguous";
  return markers.length === 1 ? "negative" : "affirmative";
}

export function classifyCommandContext(value: string): "direct" | "quoted" | "background" | "non-action" {
  const normalized = value.normalize("NFKC").toLowerCase();
  if (/for reference only|not an instruction|do not act/iu.test(normalized)) return "non-action";
  if (/\[background\]|in the background/iu.test(normalized)) return "background";
  if (/colleague said|quote\s*:/iu.test(normalized) || /[“”"]/u.test(value)) return "quoted";
  return "direct";
}

function includesRaw(haystack: string, needle: string): boolean {
  return haystack.normalize("NFC").toLowerCase().includes(needle.normalize("NFC").toLowerCase());
}

export function scoreSafetyFixture(fixture: SafetyFixture): SafetyFixtureResult {
  const template = manifest.commandTemplates.find((candidate) => candidate.id === fixture.templateId);
  if (!template) throw new Error(`Unknown command template: ${fixture.templateId}`);
  const omitted = new Set(fixture.omitFields ?? []);
  const fieldResults = Object.entries(template.fields).map(([untypedType, expectedField]) => {
    const type = untypedType as HeldOutFieldType;
    const override = fixture.fieldOverrides[type];
    const observedField = omitted.has(type) ? undefined : { ...expectedField, ...override, context: override?.context ?? expectedField.context };
    const observed = observedField ? canonicalizeHeldOutField(type, observedField.raw, observedField.context) : null;
    const presentInRaw = observedField ? includesRaw(fixture.actualRaw, observedField.raw) : false;
    return { type, expected: expectedField.canonical ?? "", observed, presentInRaw, passed: observed === expectedField.canonical && presentInRaw };
  });
  const context = classifyCommandContext(fixture.actualRaw);
  const negation = analyzeNegation(fixture.actualRaw);
  const externalActionAllowed = fieldResults.every((result) => result.passed) && context === "direct" && negation === "affirmative";
  return {
    id: fixture.id,
    rawTranscript: fixture.actualRaw,
    fieldResults,
    context,
    negation,
    externalActionAllowed,
    expectedExternalActionAllowed: fixture.expectedExternalActionAllowed,
    passed: externalActionAllowed === fixture.expectedExternalActionAllowed,
  };
}

function typedPositivePasses(fixture: TypedFixture): boolean {
  const left = canonicalizeHeldOutField(fixture.type, fixture.left, fixture.context);
  const right = canonicalizeHeldOutField(fixture.type, fixture.right, fixture.context);
  return left !== null && left === fixture.canonical && right === fixture.canonical;
}

function typedNegativePasses(fixture: TypedFixture): boolean {
  const left = canonicalizeHeldOutField(fixture.type, fixture.left, fixture.context);
  const right = canonicalizeHeldOutField(fixture.type, fixture.right, fixture.context);
  return left === null || right === null || left !== right;
}

export function assertHeldOutMethodology(): void {
  if (manifest.schemaVersion !== "NITSYCLAW-VOICE-SMOKE-V2.1-HELD-OUT") throw new Error("Unexpected held-out schema");
  if (manifest.methodology.candidateOutputUsed || !manifest.methodology.syntheticLicenceSafe ||
      manifest.methodology.personalOrCustomerData || manifest.methodology.modelExecutionAuthorized) {
    throw new Error("Held-out methodology boundary is not fail-closed");
  }
  const namespaces = [
    manifest.positiveTyped, manifest.negativeTyped, manifest.lexicalPositive,
    manifest.lexicalNegative, manifest.commandTemplates, manifest.safetyFixtures,
    manifest.mutationSeeds, manifest.unicodeAttacks,
  ];
  for (const fixtures of namespaces) {
    const ids = fixtures.map((fixture) => fixture.id);
    if (new Set(ids).size !== ids.length) throw new Error("Held-out fixture IDs must be unique within each namespace");
  }
  if ([...manifest.positiveTyped, ...manifest.negativeTyped, ...manifest.lexicalPositive,
    ...manifest.lexicalNegative, ...manifest.safetyFixtures, ...manifest.unicodeAttacks]
    .some((fixture) => !fixture.reason.trim())) throw new Error("Every test fixture requires an explicit reason");
  for (const template of manifest.commandTemplates) {
    for (const [untypedType, field] of Object.entries(template.fields)) {
      const canonical = canonicalizeHeldOutField(untypedType as HeldOutFieldType, field.raw, field.context);
      if (canonical !== field.canonical) throw new Error(`Template ${template.id} has invalid ${untypedType} canonical`);
      if (!includesRaw(template.raw, field.raw)) throw new Error(`Template ${template.id} does not preserve ${untypedType} raw text`);
    }
  }
}

function explicitMutationResults(): boolean[] {
  return manifest.mutationSeeds.flatMap((seed) => {
    const canonical = canonicalizeHeldOutField(seed.type, seed.canonicalRaw, seed.context);
    if (canonical !== seed.canonical) return [false];
    return seed.mutations.map((mutation) => canonicalizeHeldOutField(seed.type, mutation, seed.context) !== seed.canonical);
  });
}

function generatedMutationResults(): boolean[] {
  const results: boolean[] = [];
  for (let value = 0; value <= 100; value += 1) if (value !== 15) results.push(canonicalizeHeldOutField("percentage", `${value}%`) !== "15");
  for (let minute = 0; minute < 60; minute += 1) if (minute !== 30) results.push(canonicalizeHeldOutField("time", `3:${String(minute).padStart(2, "0")} pm`) !== "15:30");
  for (let day = 1; day <= 28; day += 1) if (day !== 15) results.push(canonicalizeHeldOutField("date", `${day}/08/2026`, { locale: "en-AU" }) !== "2026-08-15");
  for (let offset = -50; offset <= 50; offset += 1) if (offset !== 0) results.push(canonicalizeHeldOutField("amount", String(1_250_000 + offset)) !== "1250000");
  for (let cents = 0; cents < 100; cents += 1) if (cents !== 50) results.push(canonicalizeHeldOutField("currency", `AUD $1,250.${String(cents).padStart(2, "0")}`) !== "AUD|1250.5");
  for (let suffix = 0; suffix < 1_000; suffix += 1) if (suffix !== 678) results.push(canonicalizeHeldOutField("phone", `0412 345 ${String(suffix).padStart(3, "0")}`) !== "+61412345678");
  for (let value = 1; value <= 20; value += 1) if (value !== 10) {
    results.push(canonicalizeHeldOutField("power", `${value} kW`) !== "10|kw");
    results.push(canonicalizeHeldOutField("energy", `${value} kWh`) !== "10|kwh");
  }
  for (let value = 1; value <= 20; value += 1) if (value !== 8) results.push(canonicalizeHeldOutField("model", `SH${value}RS`) !== "SH8RS");
  for (let value = 1; value <= 10; value += 1) if (value !== 3) results.push(canonicalizeHeldOutField("product", `Powerwall ${value}`) !== "POWERWALL|3");
  for (let value = -12; value <= 14; value += 1) if (value !== 10) {
    const sign = value < 0 ? "-" : "+";
    results.push(canonicalizeHeldOutField("timezone", `UTC${sign}${String(Math.abs(value)).padStart(2, "0")}`, { date: "2026-08-15" }) !== "+10:00");
  }
  return results;
}

export type HeldOutAudit = {
  positiveFixtureCount: number;
  positiveFixturePassed: number;
  negativeFixtureCount: number;
  negativeFixturePassed: number;
  typedPositivePassed: number;
  typedNegativeRejected: number;
  lexicalPositivePassed: number;
  lexicalNegativeRejected: number;
  safetyPassed: number;
  explicitMutationRejected: number;
  explicitMutationTotal: number;
  generatedMutationRejected: number;
  generatedMutationTotal: number;
  unicodeRejected: number;
  unicodeTotal: number;
  passed: boolean;
};

export function auditHeldOutCorpus(): HeldOutAudit {
  assertHeldOutMethodology();
  const typedPositive = manifest.positiveTyped.map(typedPositivePasses);
  const typedNegative = manifest.negativeTyped.map(typedNegativePasses);
  const lexicalPositive = manifest.lexicalPositive.map(lexicalEquivalent);
  const lexicalNegative = manifest.lexicalNegative.map((fixture) => !lexicalEquivalent(fixture));
  const safety = manifest.safetyFixtures.map(scoreSafetyFixture);
  const explicit = explicitMutationResults();
  const generated = generatedMutationResults();
  const unicode = manifest.unicodeAttacks.map((fixture) => {
    const canonical = canonicalizeHeldOutField(fixture.type, fixture.canonicalRaw);
    const attack = canonicalizeHeldOutField(fixture.type, fixture.attackRaw);
    return canonical !== null && attack !== canonical;
  });
  const safetyPositive = safety.filter((result) => result.expectedExternalActionAllowed);
  const safetyNegative = safety.filter((result) => !result.expectedExternalActionAllowed);
  const positiveFixtureCount = typedPositive.length + lexicalPositive.length + safetyPositive.length;
  const positiveFixturePassed = typedPositive.filter(Boolean).length + lexicalPositive.filter(Boolean).length + safetyPositive.filter((result) => result.passed).length;
  const negativeFixtureCount = typedNegative.length + lexicalNegative.length + safetyNegative.length + unicode.length;
  const negativeFixturePassed = typedNegative.filter(Boolean).length + lexicalNegative.filter(Boolean).length + safetyNegative.filter((result) => result.passed).length + unicode.filter(Boolean).length;
  const audit: HeldOutAudit = {
    positiveFixtureCount,
    positiveFixturePassed,
    negativeFixtureCount,
    negativeFixturePassed,
    typedPositivePassed: typedPositive.filter(Boolean).length,
    typedNegativeRejected: typedNegative.filter(Boolean).length,
    lexicalPositivePassed: lexicalPositive.filter(Boolean).length,
    lexicalNegativeRejected: lexicalNegative.filter(Boolean).length,
    safetyPassed: safety.filter((result) => result.passed).length,
    explicitMutationRejected: explicit.filter(Boolean).length,
    explicitMutationTotal: explicit.length,
    generatedMutationRejected: generated.filter(Boolean).length,
    generatedMutationTotal: generated.length,
    unicodeRejected: unicode.filter(Boolean).length,
    unicodeTotal: unicode.length,
    passed: false,
  };
  audit.passed = audit.positiveFixturePassed === audit.positiveFixtureCount &&
    audit.negativeFixturePassed === audit.negativeFixtureCount &&
    audit.safetyPassed === safety.length &&
    audit.explicitMutationRejected === audit.explicitMutationTotal &&
    audit.generatedMutationRejected === audit.generatedMutationTotal &&
    audit.unicodeRejected === audit.unicodeTotal;
  return audit;
}

export function getHeldOutManifest(): HeldOutManifest {
  return structuredClone(manifest);
}

export function getSafetyFixtureResults(): SafetyFixtureResult[] {
  return manifest.safetyFixtures.map(scoreSafetyFixture);
}
