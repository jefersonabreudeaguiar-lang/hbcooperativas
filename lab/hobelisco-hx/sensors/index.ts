/** Sensores — sinais padronizados (lab simula leitura de produção) */

import type { SensorKind, SensorSignal, SensorSignalLevel } from "../types";

function signal(
  sensor: SensorKind,
  level: SensorSignalLevel,
  message: string,
  metadata?: Record<string, string | number | boolean>
): SensorSignal {
  return { sensor, level, message, observedAt: new Date().toISOString(), metadata };
}

export function runAllSensors(context?: {
  authFailures?: number;
  syncBlocked?: boolean;
  dbLatencyMs?: number;
  creditAnomaly?: boolean;
}): SensorSignal[] {
  const ctx = context ?? {};
  const authFailures = ctx.authFailures ?? 0;
  const syncBlocked = ctx.syncBlocked ?? false;
  const dbLatencyMs = ctx.dbLatencyMs ?? 45;
  const creditAnomaly = ctx.creditAnomaly ?? false;

  return [
    signal(
      "AUTH",
      authFailures > 5 ? "WARN" : "OK",
      authFailures > 5 ? `${authFailures} falhas auth recentes` : "Auth OK",
      { failures: authFailures }
    ),
    signal(
      "SYNC",
      syncBlocked ? "WARN" : "OK",
      syncBlocked ? "Push bloqueado por coerência" : "Sync OK",
      { blocked: syncBlocked }
    ),
    signal(
      "DATABASE",
      dbLatencyMs > 500 ? "WARN" : "OK",
      dbLatencyMs > 500 ? `Latência DB ${dbLatencyMs}ms` : "Database OK",
      { latencyMs: dbLatencyMs }
    ),
    signal("API", "OK", "API OK", { rateLimit: "active" }),
    signal(
      "HB_CREDIT",
      creditAnomaly ? "CRIT" : "OK",
      creditAnomaly ? "Anomalia crédito detectada (simulada)" : "HB Credits OK",
      { anomaly: creditAnomaly }
    ),
    signal("PERFORMANCE", "OK", "Performance OK", { p95Ms: 120 }),
    signal("INTEGRITY", syncBlocked ? "WARN" : "OK", syncBlocked ? "Integridade em risco" : "Integrity OK"),
    signal("CACHE", "OK", "Cache OK"),
    signal("DEVICE", "OK", "Device sensor idle (lab)"),
    signal(
      "BEHAVIOR",
      authFailures > 10 ? "CRIT" : "OK",
      authFailures > 10 ? "Fingerprint comportamental crítico" : "Behavior OK"
    ),
  ];
}

export const SENSOR_LABELS: Record<SensorKind, string> = {
  AUTH: "Auth",
  SYNC: "Sync",
  DATABASE: "Database",
  API: "API",
  HB_CREDIT: "HB Credits",
  PERFORMANCE: "Performance",
  INTEGRITY: "Integrity",
  CACHE: "Cache",
  DEVICE: "Device",
  BEHAVIOR: "Behavior",
};
