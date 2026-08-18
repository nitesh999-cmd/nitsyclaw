import type { Embedder, LlmClient } from "../agent/deps.js";
import type {
  OllamaChatRequest,
  OllamaChatResult,
  OllamaHealth,
  OllamaModelInfo,
  OllamaProviderConfig,
  OllamaStreamChunk,
  OllamaToolCall,
  OllamaToolDefinition,
  OllamaUsage,
} from "./types.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 2_000;
const DEFAULT_CONTEXT_WINDOW = 16_384;
const MAX_ERROR_TEXT_CHARS = 180;

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    size?: number;
    modified_at?: string;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

interface OllamaChatApiResponse {
  model?: string;
  done?: boolean;
  done_reason?: string;
  message?: {
    content?: string;
    tool_calls?: Array<{
      function?: {
        name?: string;
        arguments?: Record<string, unknown> | string;
      };
    }>;
  };
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  embeddings?: number[][];
}

export class OllamaProviderError extends Error {
  constructor(
    message: string,
    readonly code: "offline" | "timeout" | "model_missing" | "bad_response" | "cancelled",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OllamaProviderError";
  }
}

export class OllamaProvider {
  readonly baseUrl: string;
  readonly chatModel?: string;
  readonly embeddingModel?: string;
  readonly contextWindow: number;

  private readonly requestTimeoutMs: number;
  private readonly healthTimeoutMs: number;
  private readonly retries: number;
  private readonly keepAlive: string;
  private readonly think: boolean;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(config: OllamaProviderConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL);
    this.chatModel = cleanModelName(config.chatModel ?? process.env.OLLAMA_CHAT_MODEL);
    this.embeddingModel = cleanModelName(config.embeddingModel ?? process.env.OLLAMA_EMBEDDING_MODEL);
    this.requestTimeoutMs = positiveInt(config.requestTimeoutMs, envNumber("OLLAMA_TIMEOUT_MS"), DEFAULT_REQUEST_TIMEOUT_MS);
    this.healthTimeoutMs = positiveInt(config.healthTimeoutMs, undefined, DEFAULT_HEALTH_TIMEOUT_MS);
    this.retries = boundedInt(config.retries, envNumber("OLLAMA_RETRIES"), 1, 0, 3);
    this.contextWindow = boundedInt(config.contextWindow, envNumber("OLLAMA_CONTEXT_LIMIT"), DEFAULT_CONTEXT_WINDOW, 1_024, 262_144);
    this.keepAlive = config.keepAlive ?? process.env.OLLAMA_KEEP_ALIVE ?? "5m";
    this.think = config.think ?? envBoolean("OLLAMA_THINK") ?? false;
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async discoverModels(signal?: AbortSignal): Promise<OllamaModelInfo[]> {
    const response = await this.requestJson<OllamaTagsResponse>("/api/tags", { method: "GET" }, {
      timeoutMs: this.healthTimeoutMs,
      retries: 0,
      signal,
    });
    return (response.models ?? [])
      .map(toModelInfo)
      .filter((model): model is OllamaModelInfo => Boolean(model));
  }

  async health(signal?: AbortSignal): Promise<OllamaHealth> {
    const started = Date.now();
    try {
      const [versionResponse, models] = await Promise.all([
        this.requestJson<{ version?: string }>("/api/version", { method: "GET" }, {
          timeoutMs: this.healthTimeoutMs,
          retries: 0,
          signal,
        }),
        this.discoverModels(signal),
      ]);
      const chatModel = selectModel(this.chatModel, models, false);
      const embeddingModel = selectModel(this.embeddingModel, models, true);
      const missing: string[] = [];
      if (!chatModel) missing.push("chat model");
      if (!embeddingModel) missing.push("embedding model");
      return {
        state: missing.length ? "degraded" : "online",
        version: versionResponse.version,
        baseUrl: this.baseUrl,
        chatModel,
        embeddingModel,
        models,
        checkedAt: this.now().toISOString(),
        latencyMs: Date.now() - started,
        reason: missing.length ? `Ollama is running but ${missing.join(" and ")} are not installed.` : undefined,
      };
    } catch (error) {
      return {
        state: "offline",
        baseUrl: this.baseUrl,
        chatModel: this.chatModel,
        embeddingModel: this.embeddingModel,
        models: [],
        checkedAt: this.now().toISOString(),
        latencyMs: Date.now() - started,
        reason: providerErrorMessage(error),
      };
    }
  }

  async chat(request: OllamaChatRequest): Promise<OllamaChatResult> {
    const model = await this.resolveModel(request.model, false, request.signal);
    const response = await this.requestJson<OllamaChatApiResponse>("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.chatBody(request, model, false)),
    }, { signal: request.signal });
    return parseChatResponse(response, model);
  }

  async chatJson<T>(request: Omit<OllamaChatRequest, "format"> & {
    schema?: Record<string, unknown>;
    validate?: (value: unknown) => value is T;
  }): Promise<{ value: T; response: OllamaChatResult }> {
    const response = await this.chat({ ...request, format: request.schema ?? "json" });
    let value: unknown;
    try {
      value = JSON.parse(stripCodeFence(response.text));
    } catch {
      throw new OllamaProviderError("Ollama returned invalid structured JSON.", "bad_response", false);
    }
    if (request.validate && !request.validate(value)) {
      throw new OllamaProviderError("Ollama JSON did not match the required response shape.", "bad_response", false);
    }
    return { value: value as T, response };
  }

  async *chatStream(request: OllamaChatRequest): AsyncGenerator<OllamaStreamChunk> {
    const model = await this.resolveModel(request.model, false, request.signal);
    const { response, cleanup } = await this.fetchResponse("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.chatBody(request, model, true)),
    }, { signal: request.signal });

    try {
      if (!response.body) {
        throw new OllamaProviderError("Ollama streaming response had no body.", "bad_response", true);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          yield streamChunk(JSON.parse(line) as OllamaChatApiResponse, model);
        }
      }
      if (buffer.trim()) yield streamChunk(JSON.parse(buffer) as OllamaChatApiResponse, model);
    } catch (error) {
      if (isAbortError(error)) throw abortProviderError(request.signal);
      if (error instanceof OllamaProviderError) throw error;
      throw new OllamaProviderError("Ollama stream ended with an invalid response.", "bad_response", true);
    } finally {
      cleanup();
    }
  }

  async embed(input: string | string[], signal?: AbortSignal): Promise<number[][]> {
    const model = await this.resolveModel(undefined, true, signal);
    const response = await this.requestJson<OllamaEmbedResponse>("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input,
        truncate: true,
        keep_alive: this.keepAlive,
      }),
    }, { signal });
    if (!Array.isArray(response.embeddings) || response.embeddings.some((row) => !Array.isArray(row))) {
      throw new OllamaProviderError("Ollama returned an invalid embedding response.", "bad_response", true);
    }
    return response.embeddings;
  }

  asEmbedder(): Embedder {
    return {
      embed: async (text) => (await this.embed(text))[0] ?? [],
    };
  }

  asLlmClient(): LlmClient {
    return {
      complete: async ({ system, messages, maxTokens }) => {
        const result = await this.chat({
          messages: [
            { role: "system", content: system },
            ...messages,
          ],
          maxTokens,
        });
        return { text: result.text };
      },
      toolStep: async ({ system, messages, tools }) => {
        const result = await this.chat({
          messages: [
            { role: "system", content: system },
            ...messages,
          ],
          tools: tools.map(toOllamaTool),
        });
        return {
          stopReason: result.toolCalls.length ? "tool_use" : result.doneReason === "length" ? "max_tokens" : "end_turn",
          toolCalls: result.toolCalls,
          text: result.text,
        };
      },
    };
  }

  private chatBody(request: OllamaChatRequest, model: string, stream: boolean): Record<string, unknown> {
    return {
      model,
      messages: request.messages,
      stream,
      tools: request.tools?.length ? request.tools : undefined,
      format: request.format,
      think: request.think ?? this.think,
      keep_alive: this.keepAlive,
      options: {
        num_ctx: boundedInt(request.contextWindow, undefined, this.contextWindow, 1_024, 262_144),
        num_predict: request.maxTokens ?? 1_024,
      },
    };
  }

  private async resolveModel(requested: string | undefined, embedding: boolean, signal?: AbortSignal): Promise<string> {
    const configured = cleanModelName(requested ?? (embedding ? this.embeddingModel : this.chatModel));
    const models = await this.discoverModels(signal);
    const selected = selectModel(configured, models, embedding);
    if (selected) return selected;
    const label = embedding ? "embedding" : "chat";
    throw new OllamaProviderError(
      models.length
        ? `No suitable Ollama ${label} model is installed${configured ? ` (configured: ${configured})` : ""}.`
        : `Ollama is running but no models are installed for ${label}.`,
      "model_missing",
      false,
    );
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    options: { timeoutMs?: number; retries?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    const { response, cleanup } = await this.fetchResponse(path, init, options);
    try {
      return await response.json() as T;
    } catch {
      throw new OllamaProviderError("Ollama returned a non-JSON response.", "bad_response", true);
    } finally {
      cleanup();
    }
  }

  private async fetchResponse(
    path: string,
    init: RequestInit,
    options: { timeoutMs?: number; retries?: number; signal?: AbortSignal } = {},
  ): Promise<{ response: Response; cleanup: () => void }> {
    const retries = options.retries ?? this.retries;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const linked = linkedAbort(options.signal, options.timeoutMs ?? this.requestTimeoutMs);
      try {
        const response = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, signal: linked.signal });
        if (!response.ok) {
          linked.cleanup();
          const retryable = response.status === 429 || response.status >= 500;
          const error = new OllamaProviderError(
            `Ollama request failed with HTTP ${response.status}.`,
            response.status === 404 ? "model_missing" : "bad_response",
            retryable,
          );
          if (!retryable || attempt === retries) throw error;
          lastError = error;
          await shortBackoff(attempt, options.signal);
          continue;
        }
        return { response, cleanup: linked.cleanup };
      } catch (error) {
        linked.cleanup();
        if (isAbortError(error)) throw abortProviderError(options.signal);
        if (error instanceof OllamaProviderError && !error.retryable) throw error;
        lastError = error;
        if (attempt === retries) break;
        await shortBackoff(attempt, options.signal);
      }
    }
    if (lastError instanceof OllamaProviderError) throw lastError;
    throw new OllamaProviderError("Ollama is unavailable at the configured local address.", "offline", true);
  }
}

function toModelInfo(raw: NonNullable<OllamaTagsResponse["models"]>[number]): OllamaModelInfo | null {
  const name = cleanModelName(raw.name ?? raw.model);
  if (!name) return null;
  const family = raw.details?.family;
  return {
    name,
    sizeBytes: typeof raw.size === "number" ? raw.size : 0,
    modifiedAt: raw.modified_at,
    family,
    parameterSize: raw.details?.parameter_size,
    quantizationLevel: raw.details?.quantization_level,
    embeddingOnly: looksLikeEmbeddingModel(name, family),
  };
}

function looksLikeEmbeddingModel(name: string, family?: string): boolean {
  return /(?:embed|embedding|bge|e5|minilm)/i.test(`${name} ${family ?? ""}`);
}

function selectModel(configured: string | undefined, models: OllamaModelInfo[], embedding: boolean): string | undefined {
  if (configured) {
    const exact = models.find((model) => model.name === configured || model.name.split(":")[0] === configured);
    if (exact && exact.embeddingOnly === embedding) return exact.name;
    return undefined;
  }
  return models.find((model) => model.embeddingOnly === embedding)?.name;
}

function parseChatResponse(response: OllamaChatApiResponse, fallbackModel: string): OllamaChatResult {
  return {
    text: response.message?.content ?? "",
    model: response.model ?? fallbackModel,
    doneReason: response.done_reason,
    toolCalls: parseToolCalls(response.message?.tool_calls),
    usage: parseUsage(response),
  };
}

function streamChunk(response: OllamaChatApiResponse, fallbackModel: string): OllamaStreamChunk {
  return {
    text: response.message?.content ?? "",
    done: response.done === true,
    model: response.model ?? fallbackModel,
    toolCalls: parseToolCalls(response.message?.tool_calls),
    usage: response.done ? parseUsage(response) : undefined,
  };
}

function parseToolCalls(raw: OllamaChatApiResponse["message"] extends infer _T
  ? Array<{ function?: { name?: string; arguments?: Record<string, unknown> | string } }> | undefined
  : never): OllamaToolCall[] {
  return (raw ?? []).flatMap((call, index) => {
    const name = call.function?.name?.trim();
    if (!name) return [];
    const args = call.function?.arguments;
    let input: Record<string, unknown> = {};
    if (typeof args === "string") {
      try {
        const parsed = JSON.parse(args) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) input = parsed as Record<string, unknown>;
      } catch {
        input = {};
      }
    } else if (args && typeof args === "object") {
      input = args;
    }
    return [{ id: `ollama-tool-${index + 1}`, name, input }];
  });
}

function parseUsage(response: OllamaChatApiResponse): OllamaUsage {
  return {
    totalDurationMs: nanosToMs(response.total_duration),
    loadDurationMs: nanosToMs(response.load_duration),
    promptEvalDurationMs: nanosToMs(response.prompt_eval_duration),
    evalDurationMs: nanosToMs(response.eval_duration),
    promptTokens: response.prompt_eval_count,
    completionTokens: response.eval_count,
  };
}

function toOllamaTool(tool: { name: string; description: string; input_schema: unknown }): OllamaToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

function linkedAbort(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason);
  else parent?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Ollama request timed out", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

function abortProviderError(parent?: AbortSignal): OllamaProviderError {
  return parent?.aborted
    ? new OllamaProviderError("Ollama request was cancelled.", "cancelled", false)
    : new OllamaProviderError("Ollama request timed out.", "timeout", true);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

function providerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/g, " ").replace(/https?:\/\/\S+/g, "[local address]").slice(0, MAX_ERROR_TEXT_CHARS);
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(trimmed)) {
    throw new Error("OLLAMA_BASE_URL must point to localhost or 127.0.0.1.");
  }
  return trimmed;
}

function cleanModelName(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned && /^[A-Za-z0-9._:/-]{1,160}$/.test(cleaned) ? cleaned : undefined;
}

function envNumber(name: string): number | undefined {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function envBoolean(name: string): boolean | undefined {
  const normalized = process.env[name]?.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized ?? "")) return true;
  if (["false", "0", "no", "off"].includes(normalized ?? "")) return false;
  return undefined;
}

function positiveInt(primary: number | undefined, secondary: number | undefined, fallback: number): number {
  const value = primary ?? secondary;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function boundedInt(
  primary: number | undefined,
  secondary: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = primary ?? secondary;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function nanosToMs(value: number | undefined): number | undefined {
  return typeof value === "number" ? Math.round(value / 1_000_000) : undefined;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ?? trimmed;
}

async function shortBackoff(attempt: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortProviderError(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 100 * (attempt + 1));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortProviderError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
