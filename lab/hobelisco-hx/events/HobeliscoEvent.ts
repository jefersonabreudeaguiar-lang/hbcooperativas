/** Contrato unificado de eventos HOBELISCO — sensores produzem, runtime consome */

export type HobeliscoEventKind =
  | "AUTH_ATTEMPT"
  | "AUTH_FAILURE"
  | "AUTH_SUCCESS"
  | "IDOR_ATTEMPT"
  | "RATE_SPIKE"
  | "API_ANOMALY"
  | "SYNC_ANOMALY"
  | "CREDIT_ANOMALY"
  | "LEDGER_ANOMALY"
  | "DATABASE_ANOMALY"
  | "INTEGRITY_FAILURE"
  | "PERFORMANCE_DEGRADATION"
  | "DEVICE_ANOMALY"
  | "ADMIN_ANOMALY"
  | "SYSTEM_ANOMALY"
  | "UNKNOWN_BEHAVIOR";

export type UnknownClassification = "UNKNOWN" | "SUSPICIOUS" | "HIGH_RISK" | "HUMAN_REQUIRED";

export interface HobeliscoEvent {
  eventId: string;
  timestamp: string;
  kind: HobeliscoEventKind;
  source: string;
  cooperativeId: string;
  actorId: string;
  endpoint?: string;
  metadata: Record<string, string | number | boolean>;
}

/** Mapeia evento → contexto de sensor (não decide defesa) */
export function eventToSensorContext(event: HobeliscoEvent): Record<string, unknown> {
  const ctx: Record<string, unknown> = { eventKind: event.kind };
  switch (event.kind) {
    case "AUTH_FAILURE":
    case "RATE_SPIKE":
      ctx.authFailures = Number(event.metadata.failures ?? 1);
      break;
    case "AUTH_SUCCESS":
      ctx.authFailures = 0;
      break;
    case "SYNC_ANOMALY":
      ctx.syncBlocked = true;
      break;
    case "API_ANOMALY":
    case "PERFORMANCE_DEGRADATION":
      ctx.apiLatencyMs = event.metadata.latencyMs ?? 8000;
      break;
    case "DATABASE_ANOMALY":
      ctx.databaseError = true;
      break;
    case "INTEGRITY_FAILURE":
      ctx.integrityAnomaly = true;
      break;
    case "CREDIT_ANOMALY":
    case "LEDGER_ANOMALY":
      ctx.creditAnomaly = true;
      break;
    case "DEVICE_ANOMALY":
      ctx.deviceChange = true;
      break;
    case "ADMIN_ANOMALY":
    case "IDOR_ATTEMPT":
      ctx.behaviorAnomaly = true;
      break;
    case "UNKNOWN_BEHAVIOR":
      ctx.behaviorAnomaly = true;
      ctx.unknownBehavior = true;
      break;
    default:
      break;
  }
  return ctx;
}

export function classifyUnknownBehavior(input: {
  sequence: string[];
  failures: number;
  hasKnownRule: boolean;
}): UnknownClassification {
  if (input.hasKnownRule) return "UNKNOWN";
  if (input.failures > 15) return "HUMAN_REQUIRED";
  if (input.failures > 8 || input.sequence.length > 6) return "HIGH_RISK";
  if (input.failures > 3) return "SUSPICIOUS";
  return "UNKNOWN";
}
