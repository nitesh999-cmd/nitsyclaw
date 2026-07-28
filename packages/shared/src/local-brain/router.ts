import type { Embedder, LlmClient } from "../agent/deps.js";
import { formatLiveWebResearchUnavailable } from "../search/live-web-research.js";
import { isExplicitLiveWebResearchRequest } from "../search/web-research-intent.js";
import { OllamaProvider, OllamaProviderError } from "./ollama-provider.js";
import type {
  DataSensitivity,
  LocalBrainLlm,
  LocalBrainMode,
  ModelRoutingDecision,
  ModelRoutingInput,
  PaRequestClass,
  RequestComplexity,
  RoutingTelemetryEvent,
} from "./types.js";

const HIGHLY_SENSITIVE_RE = /\b(password|passcode|api\s*key|secret|token|otp|2fa|bank|card number|cvv|medicare|tfn|tax file|passport|licen[cs]e number|medical|diagnosis|therapy|health record)\b/i;
const PRIVATE_RE = /\b(my|mine|i|family|partner|wife|husband|child|children|client|customer|salary|address|birthday|calendar|email|memory|reminder|commitment|project|task list)\b/i;
const DIFFICULT_RE = /\b(code|debug|architecture|legal|contract|lawsuit|medical advice|diagnos|investment|tax strategy|consequential|high stakes|root cause|security review|threat model|multi[- ]step|complex|council|best reasoning|cloud reasoning)\b/i;
const READ_ONLY_RE = /\b(find|search|look up|investigate|research|check|inspect|review|analy[sz]e|summari[sz]e|what happened|show(?: me)?|list (?:my|the|all))\b/i;
const EXTERNAL_ACTION_RE = /\b(send|email|message|text|call|book|invite|post|publish|buy|purchase|pay|transfer|submit|upload|contact|reply to)\b/i;
const DESTRUCTIVE_RE = /\b(delete|erase|remove all|wipe|cancel account|revoke|reset|overwrite|destroy|drop database)\b|\brotate\b.*\b(?:secret|token|key)\b/i;
const REVERSIBLE_LOCAL_RE = /\b(remember|save|remind|draft|prepare|organize|organise|plan|snooze|reschedule|mark done|capture|(?:save|take|write) a note)\b/i;
const PROFILE_CONTEXT_RE = /\[PRIVATE_PROFILE_CONTEXT\][\s\S]*?\[\/PRIVATE_PROFILE_CONTEXT\]/g;

export class ModelRoutingError extends Error {
  constructor(message: string, readonly decision: ModelRoutingDecision) {
    super(message);
    this.name = "ModelRoutingError";
  }
}

export function localBrainModeFromEnv(value = process.env.NITSYCLAW_MODEL_MODE): LocalBrainMode {
  const normalized = value?.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (normalized === "local_only" || normalized === "best_reasoning") return normalized;
  return "auto";
}

export function hasExplicitCloudApproval(message: string): boolean {
  return /^cloud approved for this full conversation context\s*:/i.test(message.trim());
}

export function classifyPaRequest(message: string): PaRequestClass {
  const text = message.trim();
  if (DESTRUCTIVE_RE.test(text) || (HIGHLY_SENSITIVE_RE.test(text) && EXTERNAL_ACTION_RE.test(text))) {
    return "destructive_sensitive_requires_confirmation";
  }
  if (EXTERNAL_ACTION_RE.test(text)) return "external_action_requires_approval";
  if (REVERSIBLE_LOCAL_RE.test(text)) return "reversible_local_action";
  if (READ_ONLY_RE.test(text) || /^\s*list\b/i.test(text)) return "read_only_investigation";
  return "answer_only";
}

export function classifyDataSensitivity(message: string): DataSensitivity {
  if (HIGHLY_SENSITIVE_RE.test(message)) return "highly_sensitive";
  if (PRIVATE_RE.test(message)) return "private";
  return "ordinary";
}

export function classifyRequestComplexity(message: string): RequestComplexity {
  if (DIFFICULT_RE.test(message) || message.length > 1_200) return "difficult";
  const clauses = message.split(/[.;!?]|\b(?:and then|after that|also)\b/i).filter((part) => part.trim()).length;
  return clauses >= 3 || message.length > 400 ? "moderate" : "simple";
}

export function decideModelRoute(input: ModelRoutingInput): ModelRoutingDecision {
  const requestClass = input.requestClass ?? classifyPaRequest(input.message);
  const complexity = input.complexity ?? classifyRequestComplexity(input.message);
  const sensitivity = input.sensitivity ?? classifyDataSensitivity(input.message);
  const sensitive = sensitivity !== "ordinary";
  const cloudApproved = input.explicitCloudApproval === true;
  const approvalRequired = requestClass === "external_action_requires_approval" || requestClass === "destructive_sensitive_requires_confirmation";

  if (input.mode === "local_only") {
    return input.localAvailable
      ? decision("local", input, requestClass, complexity, sensitivity, "local_only_mode", false, approvalRequired)
      : decision("blocked", input, requestClass, complexity, sensitivity, "local_only_but_ollama_unavailable", false, approvalRequired);
  }

  if (sensitive && !cloudApproved) {
    return input.localAvailable
      ? decision("local", input, requestClass, complexity, sensitivity, "sensitive_data_stays_local", false, approvalRequired)
      : decision("blocked", input, requestClass, complexity, sensitivity, "sensitive_data_cannot_fallback_without_approval", false, true);
  }


  if (sensitive && cloudApproved && input.cloudAvailable) {
    return decision("cloud", input, requestClass, complexity, sensitivity, "explicit_full_context_cloud_approval", false, approvalRequired);
  }

  // Live-information turns must be answered by the cloud model: the local brain
  // cannot search, so routing one here guarantees a stale or invented answer.
  // Placed after the sensitivity branches above, so privacy still wins.
  if (input.requiresLiveWeb) {
    return input.cloudAvailable
      ? decision("cloud", input, requestClass, complexity, sensitivity, "live_web_research_requires_cloud", false, approvalRequired)
      : decision("blocked", input, requestClass, complexity, sensitivity, "live_web_research_cloud_unavailable", false, approvalRequired);
  }

  if (input.mode === "best_reasoning") {
    if (input.cloudAvailable) {
      return decision("cloud", input, requestClass, complexity, sensitivity, "best_reasoning_mode", false, approvalRequired);
    }
    return input.localAvailable
      ? decision("local", input, requestClass, complexity, sensitivity, "cloud_unavailable_local_degraded_path", false, approvalRequired)
      : decision("blocked", input, requestClass, complexity, sensitivity, "no_model_available", false, approvalRequired);
  }

  if (complexity === "difficult" || (input.localConfidence !== undefined && input.localConfidence < 0.65)) {
    if (input.cloudAvailable) {
      return decision(
        "cloud",
        input,
        requestClass,
        complexity,
        sensitivity,
        complexity === "difficult" ? "difficult_reasoning_prefers_cloud" : "low_local_confidence",
        false,
        approvalRequired,
      );
    }
  }

  if (input.localAvailable) {
    return decision("local", input, requestClass, complexity, sensitivity, "private_everyday_local_default", !sensitive && input.cloudAvailable, approvalRequired);
  }
  if (input.cloudAvailable && !sensitive) {
    return decision("cloud", input, requestClass, complexity, sensitivity, "ollama_unavailable_safe_cloud_fallback", false, approvalRequired);
  }
  return decision("blocked", input, requestClass, complexity, sensitivity, "no_permitted_model_available", false, approvalRequired);
}

function decision(
  route: ModelRoutingDecision["route"],
  input: ModelRoutingInput,
  requestClass: PaRequestClass,
  complexity: RequestComplexity,
  sensitivity: DataSensitivity,
  reason: string,
  fallbackAllowed: boolean,
  requiresApproval: boolean,
): ModelRoutingDecision {
  return {
    route,
    mode: input.mode,
    requestClass,
    complexity,
    sensitivity,
    model: route === "local" ? input.localModel : undefined,
    reason,
    fallbackAllowed,
    requiresApproval,
  };
}

export interface RoutedLlmOptions {
  local: OllamaProvider;
  cloud?: LlmClient;
  mode?: LocalBrainMode;
  explicitCloudApproval?: (latestUserMessage: string) => boolean;
  telemetry?: (event: RoutingTelemetryEvent) => void | Promise<void>;
  now?: () => Date;
  healthCacheMs?: number;
}

export function createRoutedLlm(options: RoutedLlmOptions): LocalBrainLlm {
  const mode = options.mode ?? localBrainModeFromEnv();
  const localClient = options.local.asLlmClient();
  const now = options.now ?? (() => new Date());
  const events: RoutingTelemetryEvent[] = [];
  let lastDecision: ModelRoutingDecision | null = null;
  let cachedHealth: { expiresAt: number; available: boolean; model?: string } | null = null;

  const healthState = async (): Promise<{ available: boolean; model?: string }> => {
    if (cachedHealth && cachedHealth.expiresAt > Date.now()) return cachedHealth;
    const health = await options.local.health();
    cachedHealth = {
      expiresAt: Date.now() + (options.healthCacheMs ?? 5_000),
      available: health.state !== "offline" && Boolean(health.chatModel),
      model: health.chatModel,
    };
    return cachedHealth;
  };

  const emit = async (event: RoutingTelemetryEvent): Promise<void> => {
    events.push(event);
    if (events.length > 100) events.shift();
    await options.telemetry?.(event);
  };

  const execute = async <T>(
    latestMessage: string,
    outboundText: string,
    localCall: () => Promise<T>,
    cloudCall: (() => Promise<T>) | undefined,
    requiresLiveWeb = false,
  ): Promise<T> => {
    const health = await healthState();
    const decision = decideModelRoute({
      message: outboundText,
      mode,
      localAvailable: health.available,
      localModel: health.model,
      cloudAvailable: Boolean(cloudCall),
      explicitCloudApproval: options.explicitCloudApproval?.(latestMessage) === true,
      requestClass: classifyPaRequest(latestMessage),
      complexity: classifyRequestComplexity(latestMessage),
      sensitivity: classifyDataSensitivity(outboundText),
      requiresLiveWeb,
    });
    lastDecision = decision;
    const started = Date.now();
    if (decision.route === "blocked") {
      await emit(eventFor(decision, now, Date.now() - started, false, false, "routing_blocked"));
      throw new ModelRoutingError(blockedMessage(decision), decision);
    }
    const primary = decision.route === "local" ? localCall : cloudCall;
    if (!primary) {
      await emit(eventFor(decision, now, Date.now() - started, false, false, "model_unavailable"));
      throw new ModelRoutingError("The selected model route is not configured.", decision);
    }
    try {
      const result = await primary();
      await emit(eventFor(decision, now, Date.now() - started, true, false));
      return result;
    } catch (error) {
      const mayFallback = decision.route === "local" && decision.fallbackAllowed && Boolean(cloudCall);
      if (!mayFallback) {
        await emit(eventFor(decision, now, Date.now() - started, false, false, errorCode(error)));
        throw error;
      }
      const fallbackDecision: ModelRoutingDecision = {
        ...decision,
        route: "cloud",
        model: undefined,
        reason: "local_runtime_failure_safe_cloud_fallback",
        fallbackAllowed: false,
      };
      lastDecision = fallbackDecision;
      const result = await cloudCall!();
      await emit(eventFor(fallbackDecision, now, Date.now() - started, true, true, errorCode(error)));
      return result;
    }
  };

  return {
    async complete(args) {
      const message = latestUserMessage(args.messages);
      return execute(message, sensitivityText(args), () => localClient.complete(args), options.cloud ? () => options.cloud!.complete({ ...args, system: cloudSafeSystem(args.system) }) : undefined);
    },
    async toolStep(args) {
      const message = latestUserMessage(args.messages);
      return execute(
        message,
        sensitivityText(args),
        () => localClient.toolStep(args),
        options.cloud ? () => options.cloud!.toolStep({ ...args, system: cloudSafeSystem(args.system) }) : undefined,
        requiresLiveWebAnswer(args.system, args.messages),
      );
    },
    getLastRoutingDecision: () => lastDecision,
    getRecentRoutingEvents: () => [...events],
  };
}

export function createPrivacyAwareEmbedder(options: {
  local: OllamaProvider;
  cloud?: Embedder;
  explicitCloudApproval?: (text: string) => boolean;
}): Embedder {
  const localEmbedder = options.local.asEmbedder();
  return {
    async embed(text) {
      const health = await options.local.health();
      if (health.state !== "offline" && health.embeddingModel) {
        return localEmbedder.embed(text);
      }
      if (options.cloud && options.explicitCloudApproval?.(text) === true) return options.cloud.embed(text);
      return [];
    },
  };
}

/**
 * True when this turn has to answer from live web results — either the caller
 * already injected pre-search findings, or the owner's message is itself an
 * explicit live-information request. The injected marker is checked as well as
 * the message because later loop rounds carry synthetic "Tool results:" turns,
 * which would otherwise make the flag flip off mid-turn.
 */
export function requiresLiveWebAnswer(
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): boolean {
  if (system.includes("[LIVE_WEB_RESEARCH_RESULTS]")) return true;
  return isExplicitLiveWebResearchRequest(latestUserMessage(messages));
}

function latestUserMessage(messages: Array<{ role: "user" | "assistant"; content: string }>): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function sensitivityText(args: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  const dynamicSystem = args.system.includes("You are NitsyClaw") ? "" : args.system;
  return [dynamicSystem, ...args.messages.map((message) => message.content)].join("\n\n");
}

function cloudSafeSystem(system: string): string {
  if (!system.includes("You are NitsyClaw")) return system;
  return system.replace(PROFILE_CONTEXT_RE, "[PRIVATE_PROFILE_CONTEXT OMITTED FROM CLOUD ROUTE]");
}

function eventFor(
  decision: ModelRoutingDecision,
  now: () => Date,
  latencyMs: number,
  success: boolean,
  fallback: boolean,
  error?: string,
): RoutingTelemetryEvent {
  return {
    at: now().toISOString(),
    route: decision.route,
    mode: decision.mode,
    reasonCode: decision.reason,
    model: decision.model,
    latencyMs,
    success,
    fallback,
    requestClass: decision.requestClass,
    sensitivity: decision.sensitivity,
    errorCode: error,
  };
}

function errorCode(error: unknown): string {
  if (error instanceof OllamaProviderError) return `ollama_${error.code}`;
  return "model_call_failed";
}

function blockedMessage(decision: ModelRoutingDecision): string {
  if (decision.reason === "live_web_research_cloud_unavailable") {
    return formatLiveWebResearchUnavailable("not_configured");
  }
  if (decision.reason.includes("sensitive_data")) {
    return "This request contains private information, and the local brain is unavailable. I did not send it to a cloud model. Start Ollama or explicitly approve cloud escalation.";
  }
  if (decision.mode === "local_only") {
    return "Local-only mode is active, but the local brain is unavailable or has no chat model installed.";
  }
  return "No permitted model is currently available for this request.";
}
