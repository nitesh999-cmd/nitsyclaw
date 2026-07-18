import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertProspectDemoSafeEnv,
  isProspectDemoEnabled,
  PROSPECT_DEMO_FIXTURE_NAME,
  resetProspectDemoState,
  runProspectDemoAction,
} from "./prospect-demo-fixture";

const safeEnv = {
  NITSYCLAW_LOCAL_BRAIN_PROSPECT_DEMO: "1",
  NITSYCLAW_SYNTHETIC_DB_FIXTURE: PROSPECT_DEMO_FIXTURE_NAME,
  NITSYCLAW_MODEL_MODE: "local_only",
  OLLAMA_BASE_URL: "http://127.0.0.1:11434",
};

describe("Local Brain prospect demo safety", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(safeEnv)) vi.stubEnv(key, value);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL_DIRECT", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("is disabled without its explicit local flag", () => {
    expect(isProspectDemoEnabled({})).toBe(false);
    expect(isProspectDemoEnabled(safeEnv)).toBe(true);
  });

  it("fails closed with database, production, cloud-model, provider, or remote Ollama access", () => {
    expect(() => assertProspectDemoSafeEnv(safeEnv)).not.toThrow();
    expect(() => assertProspectDemoSafeEnv({ ...safeEnv, DATABASE_URL: "postgresql://db.example/test" })).toThrow(/database URL/i);
    expect(() => assertProspectDemoSafeEnv({ ...safeEnv, NODE_ENV: "production" })).toThrow(/blocked/i);
    expect(() => assertProspectDemoSafeEnv({ ...safeEnv, OPENAI_API_KEY: "not-a-real-key" })).toThrow(/OPENAI_API_KEY/);
    expect(() => assertProspectDemoSafeEnv({ ...safeEnv, OLLAMA_BASE_URL: "https://ollama.example.com" })).toThrow(/localhost Ollama/i);
    expect(() => assertProspectDemoSafeEnv({ ...safeEnv, NITSYCLAW_MODEL_MODE: "auto" })).toThrow(/local_only/i);
  });

  it("retires the old memory in underlying fixture state before acknowledging a correction", async () => {
    resetProspectDemoState();
    const corrected = await runProspectDemoAction("correct", "Correction: I drink coffee, not peppermint tea.");
    expect(corrected.reply).toContain("remember coffee from now on");
    expect(corrected.proof.oldMemoryRetired).toBe(true);
    expect(corrected.proof.outboundActionCalls).toBe(0);
  });

  it("keeps an external message waiting with zero action calls", async () => {
    resetProspectDemoState();
    const result = await runProspectDemoAction("propose", "Message Alex that I accept the quote.");
    expect(result.approval).toMatchObject({ status: "waiting", actionCalls: 0 });
    expect(result.reply).toContain("Nothing has been sent");
    expect(result.proof.outboundActionCalls).toBe(0);
  });
});
