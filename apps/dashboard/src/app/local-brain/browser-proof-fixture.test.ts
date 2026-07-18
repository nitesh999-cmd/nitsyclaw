import { describe, expect, it } from "vitest";
import {
  assertLocalBrainBrowserProofSafeEnv,
  BROWSER_PROOF_FIXTURE_NAME,
  isLocalBrainBrowserProofEnabled,
} from "./browser-proof-fixture";

const safeEnv = {
  NITSYCLAW_LOCAL_BRAIN_BROWSER_PROOF: "1",
  NITSYCLAW_SYNTHETIC_DB_FIXTURE: BROWSER_PROOF_FIXTURE_NAME,
  NITSYCLAW_MODEL_MODE: "local_only",
  OLLAMA_BASE_URL: "http://127.0.0.1:11434",
};

describe("local brain browser proof fixture safety", () => {
  it("is disabled unless the explicit proof flag is present", () => {
    expect(isLocalBrainBrowserProofEnabled({})).toBe(false);
    expect(isLocalBrainBrowserProofEnabled(safeEnv)).toBe(true);
  });

  it("accepts only a disposable local synthetic fixture", () => {
    expect(() => assertLocalBrainBrowserProofSafeEnv(safeEnv)).not.toThrow();
  });

  it("fails closed when a real database URL is present", () => {
    expect(() => assertLocalBrainBrowserProofSafeEnv({
      ...safeEnv,
      DATABASE_URL: "postgresql://postgres:password@db.example.supabase.co:6543/postgres",
    })).toThrow(/real database URL/i);
  });

  it("fails closed outside local-only mode", () => {
    expect(() => assertLocalBrainBrowserProofSafeEnv({
      ...safeEnv,
      NITSYCLAW_MODEL_MODE: "auto",
    })).toThrow(/local_only/i);
  });

  it("fails closed when Ollama is not loopback", () => {
    expect(() => assertLocalBrainBrowserProofSafeEnv({
      ...safeEnv,
      OLLAMA_BASE_URL: "https://ollama.example.com",
    })).toThrow(/localhost Ollama/i);
  });

  it("fails closed when external provider env is present", () => {
    expect(() => assertLocalBrainBrowserProofSafeEnv({
      ...safeEnv,
      OPENAI_API_KEY: "sk-test-not-real",
    })).toThrow(/OPENAI_API_KEY/);
  });
});
