import { existsSync, readFileSync } from "node:fs";

const LOCAL_BRAIN_ENV_KEYS = new Set([
  "NITSYCLAW_MODEL_MODE",
  "OLLAMA_BASE_URL",
  "OLLAMA_CHAT_MODEL",
  "OLLAMA_EMBEDDING_MODEL",
  "OLLAMA_TIMEOUT_MS",
  "OLLAMA_RETRIES",
  "OLLAMA_CONTEXT_LIMIT",
  "OLLAMA_KEEP_ALIVE",
  "OLLAMA_THINK",
]);

export function loadLocalBrainEnv(path = ".env.local"): string[] {
  if (!existsSync(path)) return [];
  const loaded: string[] = [];
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!LOCAL_BRAIN_ENV_KEYS.has(key) || process.env[key]) continue;
    process.env[key] = unquote(line.slice(separator + 1).trim());
    loaded.push(key);
  }
  return loaded;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
