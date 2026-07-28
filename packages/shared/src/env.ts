import { z } from "zod";

const envBoolean = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return value;
}, z.coerce.boolean());

const encryptionKey = z.string().min(1).refine((value) => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}, "must be 32 bytes encoded as base64");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  TIMEZONE: z.string().default("Australia/Melbourne"),
  HOME_CITY: z.string().default("Melbourne"),
  HOME_REGION: z.string().default("Victoria"),
  HOME_COUNTRY: z.string().default("Australia"),
  CURRENT_CITY: z.string().optional(),
  CURRENT_REGION: z.string().optional(),
  CURRENT_COUNTRY: z.string().optional(),
  DEFAULT_CURRENCY: z.string().default("AUD"),
  REPLY_LANGUAGE: z.string().default("English"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  NITSYCLAW_MODEL_MODE: z.enum(["local_only", "auto", "best_reasoning"]).default("auto"),
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),
  OLLAMA_CHAT_MODEL: z.string().optional(),
  OLLAMA_EMBEDDING_MODEL: z.string().optional(),
  OLLAMA_TIMEOUT_MS: z.coerce.number().min(1_000).max(300_000).default(45_000),
  OLLAMA_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  OLLAMA_CONTEXT_LIMIT: z.coerce.number().int().min(1_024).max(262_144).default(16_384),
  OLLAMA_THINK: envBoolean.default(false),
  OPENAI_API_KEY: z.string().optional(),
  TRANSCRIPTION_MODEL: z.string().default("whisper-1"),
  SERPER_API_KEY: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().optional().optional(),
  WHATSAPP_SESSION_DIR: z.string().default(".wa-session"),
  WHATSAPP_OWNER_NUMBER: z.string().min(1),
  NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS: z.coerce.number().min(0).max(3_600_000).default(60_000),
  NITSYCLAW_WHATSAPP_INITIALIZE_TIMEOUT_MS: z.coerce.number().min(30_000).max(900_000).default(240_000),
  ENCRYPTION_KEY: encryptionKey,
  DAILY_LLM_BUDGET_USD: z.coerce.number().default(5),
  ENABLE_HEARTBEAT: envBoolean.default(true),
  ENABLE_WEB_RESEARCH: envBoolean.default(true),
  // Hard cap on Anthropic server-side searches per research call, so search
  // charges stay bounded. Raise deliberately — each search is billed.
  WEB_SEARCH_MAX_USES: z.coerce.number().int().min(1).max(10).default(5),
  QUIET_HOURS_START: z.string().default("22:00"),
  QUIET_HOURS_END: z.string().default("07:00"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Lazy validated env. Throws on first access if required vars are missing.
 * Tests pass an override to skip process.env.
 */
export function loadEnv(override?: Partial<NodeJS.ProcessEnv>): Env {
  if (cached && !override) return cached;
  const source = { ...process.env, ...override };
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid env: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  if (!override) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache(): void {
  cached = null;
}
