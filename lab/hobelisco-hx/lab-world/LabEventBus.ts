/** Barramento de eventos LAB — idempotente */

import { nowIso } from "./LabClock";
import type { LabEvent, LabEventType } from "./types";

let eventSeq = 0;

export function resetLabEventBus(): void {
  eventSeq = 0;
}

export class LabEventBus {
  private events: LabEvent[] = [];
  private seenIds = new Set<string>();

  publish(input: Omit<LabEvent, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }): LabEvent {
    const eventId = input.eventId ?? `EVT-LAB-${++eventSeq}`;
    if (this.seenIds.has(eventId)) {
      return this.events.find((e) => e.eventId === eventId)!;
    }
    const event: LabEvent = {
      eventId,
      timestamp: input.timestamp ?? nowIso(),
      type: input.type,
      source: input.source,
      cooperativeId: input.cooperativeId,
      actorId: input.actorId,
      metadata: input.metadata,
    };
    this.seenIds.add(eventId);
    this.events.push(event);
    return event;
  }

  all(): LabEvent[] {
    return [...this.events];
  }

  byCooperative(cooperativeId: string): LabEvent[] {
    return this.events.filter((e) => e.cooperativeId === cooperativeId);
  }

  clear(): void {
    this.events = [];
    this.seenIds.clear();
  }

  toSensorContext(event: LabEvent): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};
    switch (event.type) {
      case "auth_failure":
        ctx.authFailures = (Number(ctx.authFailures ?? 0) || 0) + 1;
        break;
      case "auth_success":
        ctx.authFailures = 0;
        break;
      case "sync_conflict":
        ctx.syncBlocked = true;
        break;
      case "api_latency":
        ctx.apiLatencyMs = event.metadata.latencyMs ?? 5000;
        break;
      case "database_error":
        ctx.databaseError = true;
        break;
      case "integrity_change":
        ctx.integrityAnomaly = true;
        break;
      case "hb_credit_anomaly":
        ctx.creditAnomaly = true;
        break;
      case "cache_failure":
        ctx.cacheFailure = true;
        break;
      case "device_change":
        ctx.deviceChange = true;
        break;
      case "behavior_anomaly":
        ctx.behaviorAnomaly = true;
        break;
      default:
        break;
    }
    return ctx;
  }
}

export function labEventTypeFromScenario(scenario: string): LabEventType {
  const map: Record<string, LabEventType> = {
    "auth-burst": "auth_failure",
    "sync-failure": "sync_conflict",
    "api-latency": "api_latency",
    "database-failure": "database_error",
    "integrity-anomaly": "integrity_change",
    "hb-credit-inconsistency": "hb_credit_anomaly",
    "device-anomaly": "device_change",
    "behavior-anomaly": "behavior_anomaly",
    "cache-failure": "cache_failure",
    "financial-attempt": "normal_operation",
    "sensor-death": "critical_wake",
    "memory-failure": "critical_wake",
    "guardian-failure": "behavior_anomaly",
    "full-life": "normal_operation",
  };
  return map[scenario] ?? "normal_operation";
}
