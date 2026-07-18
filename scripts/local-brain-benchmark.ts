import { freemem, totalmem } from "node:os";
import { OllamaProvider, type OllamaUsage } from "@nitsyclaw/shared/local-brain";
import { loadLocalBrainEnv } from "./local-brain-env.js";

loadLocalBrainEnv();

interface RunningModel {
  name?: string;
  size?: number;
  size_vram?: number;
}

interface BenchmarkSample {
  status: "complete";
  phase: "cold" | "warm";
  iteration: number;
  firstTokenMs: number;
  totalMs: number;
  outputCharacters: number;
  promptTokens: number | null;
  completionTokens: number | null;
  tokensPerSecond: number | null;
  loadDurationMs: number | null;
  evalDurationMs: number | null;
}

async function main() {
  const configuredTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 45_000);
  const measurementTimeoutMs = Math.max(180_000, configuredTimeoutMs);
  const provider = new OllamaProvider({ requestTimeoutMs: measurementTimeoutMs });
  const health = await provider.health();
  if (!health.chatModel) {
    console.log(JSON.stringify({
      status: "not_run",
      mode: process.env.NITSYCLAW_MODEL_MODE ?? "auto",
      reason: health.reason ?? "No Ollama chat model is installed.",
      detectedModels: health.models.map((model) => model.name),
      firstTokenMs: null,
      totalMs: null,
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const memoryBefore = memorySnapshot();
  await unloadModel(provider.baseUrl, health.chatModel);
  await delay(750);

  const samples: BenchmarkSample[] = [];
  samples.push(await runSample(provider, "cold", 1));
  for (let iteration = 1; iteration <= 3; iteration += 1) {
    samples.push(await runSample(provider, "warm", iteration));
  }

  const running = await runningModels(provider.baseUrl);
  const active = running.find((model) => model.name === health.chatModel || model.name?.split(":")[0] === health.chatModel?.split(":")[0]);
  const modelBytes = active?.size ?? null;
  const vramBytes = active?.size_vram ?? null;
  const placement = modelBytes === null || vramBytes === null
    ? "unknown"
    : vramBytes === 0
      ? "cpu"
      : vramBytes >= modelBytes * 0.95
        ? "gpu"
        : "partial_gpu";
  const memoryAfter = memorySnapshot();
  const cold = samples[0]!;
  const warm = samples.slice(1);

  console.log(JSON.stringify({
    status: "complete",
    mode: process.env.NITSYCLAW_MODEL_MODE ?? "auto",
    model: health.chatModel,
    configuredRequestTimeoutMs: configuredTimeoutMs,
    measurementTimeoutMs,
    configuredTimeoutExceeded: cold.totalMs > configuredTimeoutMs || warm.some((sample) => sample.totalMs > configuredTimeoutMs),
    cold,
    warm: {
      iterations: warm.length,
      medianFirstTokenMs: median(warm.map((sample) => sample.firstTokenMs)),
      medianTotalMs: median(warm.map((sample) => sample.totalMs)),
      averageTokensPerSecond: average(warm.map((sample) => sample.tokensPerSecond).filter((value): value is number => value !== null)),
      samples: warm,
    },
    runtime: {
      placement,
      modelMemoryBytes: modelBytes,
      modelVramBytes: vramBytes,
      estimatedModelRamBytes: modelBytes !== null && vramBytes !== null ? Math.max(0, modelBytes - vramBytes) : null,
      systemRamTotalBytes: memoryAfter.totalBytes,
      systemRamUsedBeforeBytes: memoryBefore.usedBytes,
      systemRamUsedAfterBytes: memoryAfter.usedBytes,
      systemRamDeltaBytes: memoryAfter.usedBytes - memoryBefore.usedBytes,
    },
  }, null, 2));
}

async function runSample(provider: OllamaProvider, phase: BenchmarkSample["phase"], iteration: number): Promise<BenchmarkSample> {
  const started = performance.now();
  let firstTokenMs: number | undefined;
  let outputCharacters = 0;
  let usage: OllamaUsage | undefined;
  for await (const chunk of provider.chatStream({
    messages: [
      { role: "system", content: "Reply in one warm, concise sentence. Do not use tools." },
      { role: "user", content: "Suggest one reversible first step for organising a busy day." },
    ],
    maxTokens: 80,
  })) {
    if (chunk.text && firstTokenMs === undefined) firstTokenMs = performance.now() - started;
    outputCharacters += chunk.text.length;
    if (chunk.usage) usage = chunk.usage;
  }
  const totalMs = performance.now() - started;
  const completionTokens = usage?.completionTokens ?? null;
  const evalDurationMs = usage?.evalDurationMs ?? null;
  return {
    status: "complete",
    phase,
    iteration,
    firstTokenMs: round(firstTokenMs ?? totalMs),
    totalMs: round(totalMs),
    outputCharacters,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens,
    tokensPerSecond: completionTokens !== null && evalDurationMs && evalDurationMs > 0 ? round(completionTokens / (evalDurationMs / 1_000)) : null,
    loadDurationMs: usage?.loadDurationMs ?? null,
    evalDurationMs,
  };
}

async function unloadModel(baseUrl: string, model: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [], stream: false, keep_alive: 0 }),
  });
  if (!response.ok) throw new Error(`Could not unload ${model} before the cold benchmark (HTTP ${response.status}).`);
}

async function runningModels(baseUrl: string): Promise<RunningModel[]> {
  const response = await fetch(`${baseUrl}/api/ps`);
  if (!response.ok) return [];
  const body = await response.json() as { models?: RunningModel[] };
  return body.models ?? [];
}

function memorySnapshot(): { totalBytes: number; usedBytes: number } {
  const totalBytes = totalmem();
  return { totalBytes, usedBytes: totalBytes - freemem() };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function average(values: number[]): number | null {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main();
