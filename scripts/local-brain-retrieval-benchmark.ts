import { OllamaProvider, runLocalMemoryRetrievalBenchmark } from "@nitsyclaw/shared/local-brain";
import { loadLocalBrainEnv } from "./local-brain-env.js";

async function main() {
  loadLocalBrainEnv();
  const provider = new OllamaProvider();
  const health = await provider.health();
  if (!health.embeddingModel) {
    console.log(JSON.stringify({ status: "not_run", reason: health.reason ?? "No local embedding model is installed." }, null, 2));
    process.exitCode = 1;
    return;
  }
  const started = performance.now();
  const result = await runLocalMemoryRetrievalBenchmark({ embedder: provider.asEmbedder() });
  console.log(JSON.stringify({
    status: result.passed ? "pass" : "fail",
    mode: process.env.NITSYCLAW_MODEL_MODE ?? "auto",
    model: health.embeddingModel,
    durationMs: Math.round((performance.now() - started) * 10) / 10,
    ...result,
  }, null, 2));
  if (!result.passed) process.exitCode = 1;
}

void main();
