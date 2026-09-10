/**
 * Bridge de observação — registra eventos API/auth/sync sem alterar comportamento
 * Fire-and-forget; falhas silenciosas não afetam request
 */

import {
  bridgeApiObservation,
  bridgeAuthObservation,
  bridgeSyncObservation,
} from "@lab/hobelisco-hx/observation/SensorBridge";
import {
  initHobeliscoObserver,
  observeNormalized,
  observeRaw,
} from "@lab/hobelisco-hx/observer/ObserverSingleton";
import { resolveHobeliscoEnvironment } from "@lab/hobelisco-hx/environment/HobeliscoEnvironment";
import { isHobeliscoV2ObserverEnabledServer } from "./hobeliscoV2Gate";

export interface ApiObservationInput {
  endpoint: string;
  method: string;
  status: number;
  latencyMs: number;
  requestId?: string;
  correlationId?: string;
  cooperativeId?: string | null;
}

let bridgeEnabled = false;

export function initHobeliscoObservationBridge(): void {
  bridgeEnabled = isHobeliscoV2ObserverEnabledServer();
  if (bridgeEnabled) {
    initHobeliscoObserver();
  }
}

export function isHobeliscoObservationBridgeActive(): boolean {
  return bridgeEnabled;
}

export function recordApiObservation(input: ApiObservationInput): void {
  if (!bridgeEnabled) return;
  const environment = resolveHobeliscoEnvironment();
  const event = bridgeApiObservation(environment, {
    endpoint: input.endpoint,
    operation: input.method,
    status: input.status,
    latencyMs: input.latencyMs,
    requestId: input.requestId,
    correlationId: input.correlationId,
    cooperativeId: input.cooperativeId,
  });
  observeNormalized(event);
}

export function recordAuthObservation(input: {
  eventType: string;
  cooperativeId?: string | null;
  actorIdHash?: string | null;
  outcome: "success" | "failure";
}): void {
  if (!bridgeEnabled) return;
  const environment = resolveHobeliscoEnvironment();
  const eventType =
    input.outcome === "success"
      ? ("auth_success" as const)
      : input.eventType.includes("denied")
        ? ("access_denied" as const)
        : ("auth_failure" as const);

  const event = bridgeAuthObservation(environment, {
    eventType,
    cooperativeId: input.cooperativeId,
    actorId: input.actorIdHash,
    metadata: { bridgeEventType: input.eventType },
  });
  observeNormalized(event);
}

export function recordSyncObservation(input: {
  eventType: string;
  cooperativeId?: string | null;
  outcome: "success" | "failure" | "unknown";
  durationMs?: number;
}): void {
  if (!bridgeEnabled) return;
  const environment = resolveHobeliscoEnvironment();
  const event = bridgeSyncObservation(environment, {
    eventType: input.eventType,
    cooperativeId: input.cooperativeId,
    outcome: input.outcome,
    durationMs: input.durationMs,
  });
  observeNormalized(event);
}

export function recordRawObservation(
  raw: Parameters<typeof observeRaw>[0]
): void {
  if (!bridgeEnabled) return;
  observeRaw(raw);
}
