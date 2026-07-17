import type { LlmClient } from "../agent/deps.js";

export type LocalBrainMode = "local_only" | "auto" | "best_reasoning";
export type OllamaHealthState = "online" | "degraded" | "offline";

export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
  modifiedAt?: string;
  family?: string;
  parameterSize?: string;
  quantizationLevel?: string;
  embeddingOnly: boolean;
}

export interface OllamaHealth {
  state: OllamaHealthState;
  version?: string;
  baseUrl: string;
  chatModel?: string;
  embeddingModel?: string;
  models: OllamaModelInfo[];
  checkedAt: string;
  latencyMs: number;
  reason?: string;
}

export interface OllamaProviderConfig {
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  requestTimeoutMs?: number;
  healthTimeoutMs?: number;
  retries?: number;
  contextWindow?: number;
  keepAlive?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

export interface OllamaChatRequest {
  messages: OllamaChatMessage[];
  model?: string;
  tools?: OllamaToolDefinition[];
  format?: "json" | Record<string, unknown>;
  maxTokens?: number;
  contextWindow?: number;
  signal?: AbortSignal;
}

export interface OllamaToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface OllamaUsage {
  totalDurationMs?: number;
  loadDurationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface OllamaChatResult {
  text: string;
  model: string;
  doneReason?: string;
  toolCalls: OllamaToolCall[];
  usage: OllamaUsage;
}

export interface OllamaStreamChunk {
  text: string;
  done: boolean;
  model: string;
  toolCalls: OllamaToolCall[];
  usage?: OllamaUsage;
}

export interface LocalBrainLlm extends LlmClient {
  getLastRoutingDecision(): ModelRoutingDecision | null;
  getRecentRoutingEvents(): RoutingTelemetryEvent[];
}

export type PaRequestClass =
  | "answer_only"
  | "read_only_investigation"
  | "reversible_local_action"
  | "external_action_requires_approval"
  | "destructive_sensitive_requires_confirmation";

export type RequestComplexity = "simple" | "moderate" | "difficult";
export type DataSensitivity = "ordinary" | "private" | "highly_sensitive";
export type ModelRoute = "local" | "cloud" | "blocked";

export interface ModelRoutingInput {
  message: string;
  mode: LocalBrainMode;
  localAvailable: boolean;
  localModel?: string;
  cloudAvailable: boolean;
  explicitCloudApproval?: boolean;
  localConfidence?: number;
  requestClass?: PaRequestClass;
  complexity?: RequestComplexity;
  sensitivity?: DataSensitivity;
}

export interface ModelRoutingDecision {
  route: ModelRoute;
  mode: LocalBrainMode;
  requestClass: PaRequestClass;
  complexity: RequestComplexity;
  sensitivity: DataSensitivity;
  model?: string;
  reason: string;
  fallbackAllowed: boolean;
  requiresApproval: boolean;
}

export interface RoutingTelemetryEvent {
  at: string;
  route: ModelRoute;
  mode: LocalBrainMode;
  reasonCode: string;
  model?: string;
  latencyMs: number;
  success: boolean;
  fallback: boolean;
  requestClass: PaRequestClass;
  sensitivity: DataSensitivity;
  errorCode?: string;
}
