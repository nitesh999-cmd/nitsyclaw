// Durable audit payload for the `model_route` event.
//
// Built from the routing event alone. The event carries no owner, tenant,
// account, session or request identifier, so a stable owner-linked value cannot
// reach the payload even if a caller has one in scope — which is exactly how
// `ownerHash` previously leaked in.
//
// Runtime routing, privacy classification, owner isolation, model selection and
// fallback behaviour are untouched by this module: it only shapes what is
// persisted after the decision has already been made.

import type { RoutingTelemetryEvent } from "./types.js";

export interface ModelRouteAuditPayload {
  input: {
    mode: RoutingTelemetryEvent["mode"];
    reason: string;
    requestClass: RoutingTelemetryEvent["requestClass"];
    sensitivity: RoutingTelemetryEvent["sensitivity"];
  };
  output: {
    route: RoutingTelemetryEvent["route"];
    model?: string;
    fallback: boolean;
  };
  success: boolean;
  durationMs: number;
  /** Bounded routing code (e.g. "model_call_failed"), never free text. */
  error?: string;
}

/**
 * The single shape every `model_route` producer persists.
 *
 * Fields are copied explicitly rather than spread, so a future field added to
 * the event — or an extra property attached by a caller — cannot silently begin
 * being written to `audit_log`.
 */
export function buildModelRouteAuditPayload(event: RoutingTelemetryEvent): ModelRouteAuditPayload {
  return {
    input: {
      mode: event.mode,
      reason: event.reasonCode,
      requestClass: event.requestClass,
      sensitivity: event.sensitivity,
    },
    output: {
      route: event.route,
      model: event.model,
      fallback: event.fallback,
    },
    success: event.success,
    durationMs: event.latencyMs,
    ...(event.errorCode ? { error: event.errorCode } : {}),
  };
}
