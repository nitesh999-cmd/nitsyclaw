import { localBrainModeFromEnv, OllamaProvider } from "@nitsyclaw/shared/local-brain";

async function main() {
const health = await new OllamaProvider().health();
console.log(JSON.stringify({
  mode: localBrainModeFromEnv(),
  state: health.state,
  version: health.version,
  baseUrl: health.baseUrl,
  chatModel: health.chatModel,
  embeddingModel: health.embeddingModel,
  models: health.models.map((model) => ({
    name: model.name,
    sizeBytes: model.sizeBytes,
    parameterSize: model.parameterSize,
    embeddingOnly: model.embeddingOnly,
  })),
  latencyMs: health.latencyMs,
  reason: health.reason,
}, null, 2));

if (health.state === "offline") process.exitCode = 2;
else if (health.state === "degraded") process.exitCode = 1;
}

void main();
