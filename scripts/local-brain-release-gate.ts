import {
  OllamaProvider,
  PA_EVALUATION_SCENARIOS,
  runLocalMemoryRetrievalBenchmark,
  runPaEvaluation,
  summarizePaEvaluation,
} from "@nitsyclaw/shared/local-brain";
import { loadLocalBrainEnv } from "./local-brain-env.js";

async function main() {
  loadLocalBrainEnv();
  const mode = process.env.NITSYCLAW_MODEL_MODE ?? "auto";
  const provider = new OllamaProvider();
  const health = await provider.health();
  const policy = summarizePaEvaluation(runPaEvaluation());
  const retrieval = health.embeddingModel
    ? await runLocalMemoryRetrievalBenchmark({ embedder: provider.asEmbedder() })
    : null;
  const checks = {
    localOnlyMode: mode === "local_only",
    ollamaOnline: health.state === "online",
    exactChatModel: health.chatModel === "qwen3:8b",
    exactEmbeddingModel: health.embeddingModel === "nomic-embed-text:latest" || health.embeddingModel === "nomic-embed-text",
    policyScenarios: policy.passed === PA_EVALUATION_SCENARIOS.length,
    retrievalThresholds: retrieval?.passed === true,
  };
  const passed = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    status: passed ? "pass" : "fail",
    checks,
    health: { state: health.state, version: health.version, chatModel: health.chatModel, embeddingModel: health.embeddingModel },
    policy: { passed: policy.passed, total: policy.total, averageScores: policy.averageScores },
    retrieval: retrieval ? {
      totalQueries: retrieval.totalQueries,
      top1Accuracy: retrieval.top1Accuracy,
      top3Accuracy: retrieval.top3Accuracy,
      groundingAccuracy: retrieval.groundingAccuracy,
      privacyFailures: retrieval.privacyFailures,
      injectionFailures: retrieval.injectionFailures,
      staleMemoryFailures: retrieval.staleMemoryFailures,
      thresholds: retrieval.thresholds,
    } : null,
  }, null, 2));

  if (!passed) process.exitCode = 1;
}

void main();
