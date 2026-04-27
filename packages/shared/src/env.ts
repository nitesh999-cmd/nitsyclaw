import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  TIMEZONE: z.string().default("Asia/Kolkata"),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  OPENAI_API_KEY: z.string().optional(),
  TRANSCRIPTION_MODEL: z.string().default("whisper-1"),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().optional().optional(),
  WHATSAPP_SESSION_DIR: z.string().default(".wa-session"),
  WHATSAPP_OWNER_NUMBER: z.string().min(1),
  ENCRYPTION_KEY: z.string().optional(),
  DAILY_LLM_BUDGET_USD: z.coerce.number().default(5),
  ENABLE_HEARTBEAT: z.coerce.boolean().default(true),
  ENABLE_WEB_RESEARCH: z.coerce.boolean().default(true),
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
