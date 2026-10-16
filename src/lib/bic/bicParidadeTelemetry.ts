/**
 * Concerto BIC — Movimento IV: telemetria leve no cliente (sessionStorage).
 */
const KEY = "hb.bic.paridadeTelemetry.v1";

export type BicParidadeTelemetry = {
  pulses: number;
  revisionUnchanged: number;
  lightPull: number;
  rematerializeOnly: number;
  lastPulseAt: string | null;
};

function empty(): BicParidadeTelemetry {
  return {
    pulses: 0,
    revisionUnchanged: 0,
    lightPull: 0,
    rematerializeOnly: 0,
    lastPulseAt: null,
  };
}

export function readBicParidadeTelemetry(): BicParidadeTelemetry {
  if (typeof sessionStorage === "undefined") return empty();
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<BicParidadeTelemetry>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

function write(t: BicParidadeTelemetry): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* quota */
  }
}

export function recordBicParidadePulse(
  outcome: "revisionUnchanged" | "lightPull" | "rematerializeOnly"
): void {
  const t = readBicParidadeTelemetry();
  t.pulses += 1;
  t.lastPulseAt = new Date().toISOString();
  if (outcome === "revisionUnchanged") t.revisionUnchanged += 1;
  if (outcome === "lightPull") t.lightPull += 1;
  if (outcome === "rematerializeOnly") t.rematerializeOnly += 1;
  write(t);
}

export function resetBicParidadeTelemetryForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
