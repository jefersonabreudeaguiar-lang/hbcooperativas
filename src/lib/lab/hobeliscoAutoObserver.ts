/**
 * Auto-observer V2.1 — captura leve para middleware / ingest
 * STAGING observe-only: nunca bloqueia requests
 */

import { isHobeliscoV2ObserverEnabledServer } from "./hobeliscoV2Gate";

export interface HobeliscoIngestPayload {
  type: "api" | "auth" | "sync";
  endpoint: string;
  method?: string;
  status?: number;
  latencyMs?: number;
  cooperativeId?: string | null;
  outcome?: "success" | "failure" | "unknown";
  eventType?: string;
}

export function isAutoObserverEnabled(): boolean {
  return isHobeliscoV2ObserverEnabledServer();
}

export function shouldObservePath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/api/lab/hobelisco")) return false;
  return true;
}

export async function ingestHobeliscoObservation(payload: HobeliscoIngestPayload): Promise<void> {
  if (!isAutoObserverEnabled()) return;

  const {
    recordApiObservation,
    recordAuthObservation,
    recordSyncObservation,
    initHobeliscoObservationBridge,
  } = await import("./hobeliscoObservationBridge");

  initHobeliscoObservationBridge();

  if (payload.type === "auth") {
    recordAuthObservation({
      eventType: payload.eventType ?? "auth_failure",
      cooperativeId: payload.cooperativeId,
      outcome: payload.outcome === "success" ? "success" : "failure",
    });
    return;
  }

  if (payload.type === "sync") {
    recordSyncObservation({
      eventType: payload.eventType ?? "sync_event",
      cooperativeId: payload.cooperativeId,
      outcome: payload.outcome ?? "unknown",
    });
    return;
  }

  recordApiObservation({
    endpoint: payload.endpoint,
    method: payload.method ?? "GET",
    status: payload.status ?? 200,
    latencyMs: payload.latencyMs ?? 0,
    cooperativeId: payload.cooperativeId,
  });
}
