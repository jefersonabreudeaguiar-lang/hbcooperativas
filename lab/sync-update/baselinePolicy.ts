/**
 * Modelo do sync atual (Build 59) — somente referência para auditoria lab.
 * Valores espelham cooperativaSyncCloudService + CooperativaSyncProvider.
 */
import type { OperacionalSlice, SliceManifest } from "./types";

/** Gaps mínimos entre syncs (ms) — produção. */
export const BASELINE_GAPS = {
  cooperado: 120_000,
  gestao: 25_000,
  votacaoPull: 25_000,
} as const;

/** operacional.json monolítico; push fingerprint por sessão inteira. */
export const BASELINE_MONOLITHIC = true;

/** Sync periódico automático desligado (economia Edge). */
export const BASELINE_PERIODIC_ENABLED = false;

/** Limite operacional (platformCapacityService). */
export const BASELINE_OPERACIONAL_MAX_MB = 5;

/** Limite lista cooperados na UI sync. */
export const BASELINE_COOPERADO_LIST_MAX = 500;

/** Cada tentativa de sync puxa operacional inteiro se gap OK. */
export function baselinePullBytes(manifest: SliceManifest[]): number {
  return manifest.reduce((s, m) => s + m.byteEstimate, 0);
}

/** Push tenta enviar blob operacional completo quando dirty. */
export function baselinePushBytes(manifest: SliceManifest[], dirtySlices: OperacionalSlice[]): number {
  if (dirtySlices.length === 0) return 0;
  return baselinePullBytes(manifest);
}

/** Estima % de pulls redundantes (mesmo fingerprint). */
export function baselineRedundantPullPct(repeatedSameFingerprint: number, totalPulls: number): number {
  if (totalPulls === 0) return 0;
  return Math.round((repeatedSameFingerprint / totalPulls) * 1000) / 10;
}

/** Score dimensions — baseline. */
export const BASELINE_SCORE_NOTES: Record<string, string> = {
  coerencia:
    "fichaSyncGuard existe; merge mensalidade/operacional testado; mas operacional monolítico aumenta risco de overwrite parcial.",
  eficiencia:
    "Gap 25s gestão + pull operacional inteiro na votação; sem slices; sync periódico off (bom p/ Edge, ruim p/ freshness).",
  escala:
    "Limite 500 cooperados na lista; operacional 5 MB; hoje ~0,85 MB com 27 coop — projeção 1000 coop ~31 MB (inviável).",
  resiliencia:
    "Fingerprints por sessão; dedupe ficha no push; sem manifest remoto por slice; retry manual via UI.",
  seguranca:
    "Push/pull autenticados; sem validação pré-push estruturada além de guards pontuais.",
  observabilidade:
    "Logs console; simulate-sync-flows; sem métricas Edge agregadas nem dashboard de drift.",
};
