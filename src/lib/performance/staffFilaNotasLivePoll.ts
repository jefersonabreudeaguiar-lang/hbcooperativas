/**
 * Responsável na fila Conferir: cooperado envia foto → nuvem atualiza antes do pull lento.
 * Regressão: NEXT_PUBLIC_STAFF_FILA_NOTAS_LIVE_POLL=0
 */

function readEnvMs(name: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3_000 ? Math.round(n) : fallback;
}

export function isStaffFilaNotasLivePollEnabled(): boolean {
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-staff-fila-live-poll-off") === "1") {
      return false;
    }
  }
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_STAFF_FILA_NOTAS_LIVE_POLL ?? "true")
      : "true";
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

/** Intervalo mínimo entre pulls delta de notas (ms). */
export function resolveStaffNotasPullMinIntervalMs(filaConferenciaAtiva: boolean): number {
  if (!filaConferenciaAtiva || !isStaffFilaNotasLivePollEnabled()) {
    return readEnvMs("NEXT_PUBLIC_STAFF_NOTAS_PULL_MIN_MS", 90_000);
  }
  return readEnvMs("NEXT_PUBLIC_STAFF_FILA_NOTAS_PULL_MIN_MS", 5_000);
}

/** Timer periódico na aba Notas (staff). */
export function resolveStaffNotasPollIntervalMs(filaConferenciaAtiva: boolean): number {
  if (!filaConferenciaAtiva || !isStaffFilaNotasLivePollEnabled()) {
    return readEnvMs("NEXT_PUBLIC_STAFF_NOTAS_POLL_INTERVAL_MS", 120_000);
  }
  return readEnvMs("NEXT_PUBLIC_STAFF_FILA_NOTAS_POLL_INTERVAL_MS", 6_000);
}

/** Poll leve uploadProgress (meta + partes na nuvem). */
export function resolveStaffFilaUploadProgressPollMs(): number {
  return readEnvMs("NEXT_PUBLIC_STAFF_FILA_UPLOAD_PROGRESS_MS", 3_500);
}

export const STAFF_FILA_UPLOAD_PROGRESS_MAX_NOTAS = 12;
