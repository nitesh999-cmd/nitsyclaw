import { OllamaProvider } from "@nitsyclaw/shared/local-brain";

async function main() {
const provider = new OllamaProvider();
const health = await provider.health();
if (!health.chatModel) {
  console.log(JSON.stringify({
    status: "not_run",
    reason: health.reason ?? "No Ollama chat model is installed.",
    detectedModels: health.models.map((model) => model.name),
    firstTokenMs: null,
    totalMs: null,
  }, null, 2));
  return;
}

const samples: Array<{ firstTokenMs: number; totalMs: number; characters: number }> = [];
for (let iteration = 0; iteration < 3; iteration += 1) {
  const started = performance.now();
  let firstTokenMs: number | undefined;
  let characters = 0;
  for await (const chunk of provider.chatStream({
    messages: [
      { role: "system", content: "Reply in one warm, concise sentence. Do not use tools." },
      { role: "user", content: "Suggest one reversible first step for organising a busy day." },
    ],
    maxTokens: 80,
  })) {
    if (chunk.text && firstTokenMs === undefined) firstTokenMs = performance.now() - started;
    characters += chunk.text.length;
  }
  samples.push({
    firstTokenMs: Math.round((firstTokenMs ?? performance.now() - started) * 10) / 10,
    totalMs: Math.round((performance.now() - started) * 10) / 10,
    characters,
  });
}
const average = (key: "firstTokenMs" | "totalMs") => Math.round(samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length * 10) / 10;
console.log(JSON.stringify({
  status: "complete",
  model: health.chatModel,
  iterations: samples.length,
  averageFirstTokenMs: average("firstTokenMs"),
  averageTotalMs: average("totalMs"),
  samples,
}, null, 2));
}

void main();
