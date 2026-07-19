import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { looksLikeStoredPromptInjection, type LocalMemoryCandidate } from "@nitsyclaw/shared/local-brain";

export const OWNER_ALPHA_SCHEMA_VERSION = 1;
export const OWNER_ALPHA_MAX_ACTIVE_MEMORIES = 50;
export const OWNER_ALPHA_MAX_MEMORY_CHARS = 1_000;

export const BLOCKED_OWNER_ALPHA_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_ACCESS_TOKEN",
  "GOOGLE_REFRESH_TOKEN",
  "MS_CLIENT_ID",
  "MS_CLIENT_SECRET",
  "MS_ACCESS_TOKEN",
  "MS_REFRESH_TOKEN",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_ACCESS_TOKEN",
  "SPOTIFY_REFRESH_TOKEN",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "POSTHOG_API_KEY",
  "NTFY_TOPIC",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "WHATSAPP_OWNER_NUMBER",
  "WHATSAPP_SESSION",
  "WHATSAPP_SESSION_PATH",
  "RAILWAY_TOKEN",
  "VERCEL_TOKEN",
] as const;

const PRODUCTION_ENV_KEYS = ["VERCEL", "VERCEL_ENV", "RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_NAME"] as const;

export interface OwnerAlphaMemory extends LocalMemoryCandidate {
  createdAt: string;
}

export interface OwnerAlphaScorecardEntry {
  date: string;
  recordedAt: string;
  usefulMemory: number;
  correctionAccuracy: number;
  responseQuality: number;
  responseSpeed: number;
  approvalBehaviour: number;
  privacyConfidence: number;
  crashesOrConfusingBehaviour: number;
  measuredMedianResponseMs: number | null;
  notes: string;
}

export interface OwnerAlphaState {
  schemaVersion: 1;
  ownerHash: string;
  createdAt: string;
  updatedAt: string;
  memories: OwnerAlphaMemory[];
  scorecard: OwnerAlphaScorecardEntry[];
}

export interface OwnerAlphaEnvironment {
  dataDir: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
}

export function assertOwnerAlphaEnvironment(env: NodeJS.ProcessEnv = process.env): OwnerAlphaEnvironment {
  if (env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("Owner alpha refuses NODE_ENV=production.");
  }
  const productionMarker = PRODUCTION_ENV_KEYS.find((key) => nonEmpty(env[key]));
  if (productionMarker) throw new Error(`Owner alpha refuses the production marker ${productionMarker}.`);
  const blockedCredential = BLOCKED_OWNER_ALPHA_ENV_KEYS.find((key) => nonEmpty(env[key]));
  if (blockedCredential) {
    throw new Error(`Owner alpha refuses to start while ${blockedCredential} is available to the process.`);
  }
  if (env.NITSYCLAW_MODEL_MODE !== "local_only") {
    throw new Error("Owner alpha requires NITSYCLAW_MODEL_MODE=local_only.");
  }
  const baseUrl = env.OLLAMA_BASE_URL?.trim() ?? "http://127.0.0.1:11434";
  if (!isLoopbackHttpUrl(baseUrl)) throw new Error("Owner alpha requires a loopback-only OLLAMA_BASE_URL.");
  const chatModel = env.OLLAMA_CHAT_MODEL?.trim() ?? "qwen3:8b";
  if (chatModel !== "qwen3:8b") throw new Error("Owner alpha requires the exact qwen3:8b chat model.");
  const embeddingModel = env.OLLAMA_EMBEDDING_MODEL?.trim() ?? "nomic-embed-text:latest";
  if (embeddingModel !== "nomic-embed-text" && embeddingModel !== "nomic-embed-text:latest") {
    throw new Error("Owner alpha requires the nomic-embed-text embedding model.");
  }
  return { dataDir: resolveOwnerAlphaDataDir(env), baseUrl, chatModel, embeddingModel };
}

export function resolveOwnerAlphaDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.NITSYCLAW_OWNER_ALPHA_DATA_DIR?.trim();
  if (override) return resolve(override);
  const localAppData = env.LOCALAPPDATA?.trim();
  if (!localAppData) throw new Error("LOCALAPPDATA is unavailable; owner-alpha storage cannot be safely resolved.");
  return resolve(localAppData, "NitsyClaw", "owner-alpha");
}

export function loadOrCreateOwnerAlphaState(dataDir: string, now = new Date()): OwnerAlphaState {
  assertSafeOwnerAlphaDataDir(dataDir);
  mkdirSync(dataDir, { recursive: true });
  const path = statePath(dataDir);
  if (!existsSync(path)) {
    const timestamp = now.toISOString();
    const state: OwnerAlphaState = {
      schemaVersion: OWNER_ALPHA_SCHEMA_VERSION,
      ownerHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      createdAt: timestamp,
      updatedAt: timestamp,
      memories: [],
      scorecard: [],
    };
    saveOwnerAlphaState(dataDir, state, now);
    return state;
  }
  if (statSync(path).size > 1_000_000) throw new Error("Owner-alpha state is unexpectedly large; refusing to load it.");
  return parseOwnerAlphaState(readFileSync(path, "utf8"));
}

export function saveOwnerAlphaState(dataDir: string, state: OwnerAlphaState, now = new Date()): void {
  assertSafeOwnerAlphaDataDir(dataDir);
  assertValidOwnerAlphaState(state);
  mkdirSync(dataDir, { recursive: true });
  const path = statePath(dataDir);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const nextState = { ...state, updatedAt: now.toISOString() } satisfies OwnerAlphaState;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(nextState, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  writeFileSync(scorecardPath(dataDir), renderSevenDayScorecard(nextState), { encoding: "utf8", mode: 0o600 });
  Object.assign(state, nextState);
}

export function rememberOwnerAlphaMemory(
  state: OwnerAlphaState,
  content: string,
  now = new Date(),
): { status: "saved"; memory: OwnerAlphaMemory } | { status: "rejected"; reason: string } {
  const normalized = normalizeMemoryContent(content);
  if (!normalized) return { status: "rejected", reason: "Memory cannot be empty." };
  if (normalized.length > OWNER_ALPHA_MAX_MEMORY_CHARS) {
    return { status: "rejected", reason: `Memory must be ${OWNER_ALPHA_MAX_MEMORY_CHARS} characters or fewer.` };
  }
  if (looksLikeStoredPromptInjection(normalized)) {
    return { status: "rejected", reason: "Instruction-like content was rejected and not stored." };
  }
  if (activeOwnerAlphaMemories(state).length >= OWNER_ALPHA_MAX_ACTIVE_MEMORIES) {
    return { status: "rejected", reason: `The alpha is limited to ${OWNER_ALPHA_MAX_ACTIVE_MEMORIES} active memories.` };
  }
  const memory: OwnerAlphaMemory = {
    id: randomUUID(),
    ownerHash: state.ownerHash,
    content: normalized,
    kind: "owner_alpha_note",
    tags: ["confidence:explicit", "source:owner-alpha-manual"],
    createdAt: now.toISOString(),
    sourceMessageId: null,
  };
  state.memories.push(memory);
  return { status: "saved", memory };
}

export function correctOwnerAlphaMemory(
  state: OwnerAlphaState,
  previousId: string,
  correctedContent: string,
  now = new Date(),
): { status: "corrected"; previousId: string; memory: OwnerAlphaMemory } | { status: "rejected"; reason: string } {
  const previous = state.memories.find((memory) => memory.id === previousId && memory.ownerHash === state.ownerHash);
  if (!previous || isInactive(previous)) return { status: "rejected", reason: "That active owner memory was not found." };
  const normalized = normalizeMemoryContent(correctedContent);
  if (!normalized) return { status: "rejected", reason: "Correction cannot be empty." };
  if (normalized.length > OWNER_ALPHA_MAX_MEMORY_CHARS) {
    return { status: "rejected", reason: `Correction must be ${OWNER_ALPHA_MAX_MEMORY_CHARS} characters or fewer.` };
  }
  if (looksLikeStoredPromptInjection(normalized)) {
    return { status: "rejected", reason: "Instruction-like correction was rejected and not stored." };
  }
  previous.tags = uniqueTags([...previous.tags, "memory:corrected"]);
  const memory: OwnerAlphaMemory = {
    id: randomUUID(),
    ownerHash: state.ownerHash,
    content: normalized,
    kind: previous.kind,
    tags: ["confidence:explicit", "source:owner-alpha-manual", "memory:correction", `corrects:${previous.id}`],
    createdAt: now.toISOString(),
    sourceMessageId: null,
  };
  state.memories.push(memory);
  return { status: "corrected", previousId, memory };
}

export function forgetOwnerAlphaMemory(state: OwnerAlphaState, memoryId: string): boolean {
  const memory = state.memories.find((candidate) => candidate.id === memoryId && candidate.ownerHash === state.ownerHash);
  if (!memory || isInactive(memory)) return false;
  memory.tags = uniqueTags([...memory.tags, "memory:forgotten"]);
  return true;
}

export function activeOwnerAlphaMemories(state: OwnerAlphaState): OwnerAlphaMemory[] {
  return state.memories
    .filter((memory) => memory.ownerHash === state.ownerHash && !isInactive(memory))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function ownerAlphaMemoryCandidates(state: OwnerAlphaState): LocalMemoryCandidate[] {
  return [...state.memories]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((memory) => ({ ...memory }));
}

export function upsertOwnerAlphaScorecardEntry(state: OwnerAlphaState, entry: OwnerAlphaScorecardEntry): void {
  assertScorecardEntry(entry);
  const existingIndex = state.scorecard.findIndex((candidate) => candidate.date === entry.date);
  if (existingIndex >= 0) state.scorecard[existingIndex] = entry;
  else state.scorecard.push(entry);
  state.scorecard.sort((left, right) => left.date.localeCompare(right.date));
}

export function renderSevenDayScorecard(state: OwnerAlphaState): string {
  const entries = [...state.scorecard].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 7);
  const rows = Array.from({ length: 7 }, (_, index) => {
    const entry = entries[index];
    if (!entry) return `| ${index + 1} | Pending | - | - | - | - | - | - | - | - |`;
    const speed = entry.measuredMedianResponseMs === null ? "-" : `${Math.round(entry.measuredMedianResponseMs)} ms`;
    return `| ${index + 1} | ${entry.date} | ${entry.usefulMemory} | ${entry.correctionAccuracy} | ${entry.responseQuality} | ${entry.responseSpeed} | ${entry.approvalBehaviour} | ${entry.privacyConfidence} | ${entry.crashesOrConfusingBehaviour} | ${speed} |`;
  });
  const notes = entries.length
    ? entries.map((entry, index) => `- Day ${index + 1} (${entry.date}): ${entry.notes || "No notes."}`).join("\n")
    : "- No daily entries yet.";
  return [
    "# NitsyClaw Owner-Only Alpha Scorecard",
    "",
    "Rate each area from 1 (poor) to 5 (excellent). For crashes/confusing behaviour, 5 means no problems.",
    "",
    "| Day | Date | Useful memory | Correction accuracy | Response quality | Response speed | Approval behaviour | Privacy confidence | Crashes / clarity | Measured median |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows,
    "",
    "## Notes",
    "",
    notes,
    "",
  ].join("\n");
}

export function removeOwnerAlphaData(dataDir: string): void {
  assertSafeOwnerAlphaDataDir(dataDir);
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: false });
}

export function scorecardFilePath(dataDir: string): string {
  return scorecardPath(dataDir);
}

export function assertSafeOwnerAlphaDataDir(dataDir: string): void {
  const resolved = resolve(dataDir);
  const name = resolved.split(/[\\/]/).at(-1)?.toLowerCase();
  const parent = dirname(resolved).split(/[\\/]/).at(-1)?.toLowerCase();
  if (name !== "owner-alpha" || parent !== "nitsyclaw") {
    throw new Error("Refusing owner-alpha data access outside an exact NitsyClaw/owner-alpha directory.");
  }
}

function statePath(dataDir: string): string {
  return join(dataDir, "state.json");
}

function scorecardPath(dataDir: string): string {
  return join(dataDir, "scorecard.md");
}

function parseOwnerAlphaState(raw: string): OwnerAlphaState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Owner-alpha state is not valid JSON; refusing to continue.");
  }
  assertValidOwnerAlphaState(parsed);
  return parsed;
}

function assertValidOwnerAlphaState(value: unknown): asserts value is OwnerAlphaState {
  if (!value || typeof value !== "object") throw new Error("Owner-alpha state has an invalid shape.");
  const state = value as Partial<OwnerAlphaState>;
  if (state.schemaVersion !== OWNER_ALPHA_SCHEMA_VERSION) throw new Error("Owner-alpha state schema is unsupported.");
  if (typeof state.ownerHash !== "string" || !/^[a-f0-9]{64}$/.test(state.ownerHash)) throw new Error("Owner-alpha owner scope is invalid.");
  if (typeof state.createdAt !== "string" || typeof state.updatedAt !== "string") throw new Error("Owner-alpha timestamps are invalid.");
  if (!Array.isArray(state.memories) || !Array.isArray(state.scorecard)) throw new Error("Owner-alpha collections are invalid.");
  for (const memory of state.memories) {
    if (!memory || typeof memory !== "object") throw new Error("Owner-alpha memory is invalid.");
    if (memory.ownerHash !== state.ownerHash) throw new Error("Owner-alpha state contains a cross-owner memory; refusing to load it.");
    if (typeof memory.id !== "string" || typeof memory.content !== "string" || memory.content.length > OWNER_ALPHA_MAX_MEMORY_CHARS) throw new Error("Owner-alpha memory fields are invalid.");
    if (!Array.isArray(memory.tags) || typeof memory.createdAt !== "string" || typeof memory.kind !== "string") throw new Error("Owner-alpha memory metadata is invalid.");
  }
  for (const entry of state.scorecard) assertScorecardEntry(entry);
}

function assertScorecardEntry(value: unknown): asserts value is OwnerAlphaScorecardEntry {
  if (!value || typeof value !== "object") throw new Error("Owner-alpha scorecard entry is invalid.");
  const entry = value as Partial<OwnerAlphaScorecardEntry>;
  if (typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error("Owner-alpha scorecard date is invalid.");
  if (typeof entry.recordedAt !== "string" || typeof entry.notes !== "string" || entry.notes.length > 2_000) throw new Error("Owner-alpha scorecard details are invalid.");
  for (const key of ["usefulMemory", "correctionAccuracy", "responseQuality", "responseSpeed", "approvalBehaviour", "privacyConfidence", "crashesOrConfusingBehaviour"] as const) {
    if (!Number.isInteger(entry[key]) || (entry[key] ?? 0) < 1 || (entry[key] ?? 0) > 5) throw new Error(`Owner-alpha score ${key} must be 1-5.`);
  }
  if (entry.measuredMedianResponseMs !== null && (typeof entry.measuredMedianResponseMs !== "number" || entry.measuredMedianResponseMs < 0)) {
    throw new Error("Owner-alpha measured response speed is invalid.");
  }
}

function normalizeMemoryContent(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags)];
}

function isInactive(memory: OwnerAlphaMemory): boolean {
  return memory.tags.includes("memory:forgotten") || memory.tags.includes("memory:corrected");
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function isLoopbackHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
