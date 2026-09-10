/**
 * Política proposta — lab only.
 * Orquestrador com slices, manifest remoto simulado, gaps adaptativos e pull seletivo.
 */
import type { OperacionalSlice, SliceManifest, SyncPriority } from "./types";

export const PROPOSED_SLICE_ORDER: OperacionalSlice[] = [
  "votacao",
  "financeiro",
  "ficha",
  "comunicados",
  "cadastro",
  "outros",
];

/** Gaps adaptativos por prioridade (ms). */
export const PROPOSED_GAPS: Record<SyncPriority, { cooperado: number; gestao: number }> = {
  P0: { cooperado: 15_000, gestao: 8_000 },
  P1: { cooperado: 60_000, gestao: 20_000 },
  P2: { cooperado: 120_000, gestao: 45_000 },
};

export const SLICE_PRIORITY: Record<OperacionalSlice, SyncPriority> = {
  votacao: "P0",
  financeiro: "P0",
  ficha: "P1",
  comunicados: "P1",
  cadastro: "P2",
  outros: "P2",
};

export interface PullPlan {
  slices: OperacionalSlice[];
  bytes: number;
  skippedStale: OperacionalSlice[];
}

export interface PushPlan {
  slices: OperacionalSlice[];
  bytes: number;
}

/** Decide quais slices puxar comparando manifest local vs remoto simulado. */
export function planSelectivePull(
  local: SliceManifest[],
  remote: SliceManifest[],
  forceSlices?: OperacionalSlice[]
): PullPlan {
  const remoteMap = new Map(remote.map((m) => [m.slice, m]));
  const toPull: OperacionalSlice[] = [];
  const skipped: OperacionalSlice[] = [];
  let bytes = 0;

  for (const loc of local) {
    const rem = remoteMap.get(loc.slice);
    const force = forceSlices?.includes(loc.slice);
    if (force || !rem || rem.fingerprint !== loc.fingerprint) {
      toPull.push(loc.slice);
      bytes += rem?.byteEstimate ?? loc.byteEstimate;
    } else {
      skipped.push(loc.slice);
    }
  }

  return { slices: toPull, bytes, skippedStale: skipped };
}

/** Push apenas slices dirty cujo fingerprint local difere do último push confirmado. */
export function planSelectivePush(
  manifest: SliceManifest[],
  dirtySlices: OperacionalSlice[],
  lastConfirmed: Map<OperacionalSlice, string>
): PushPlan {
  const slices: OperacionalSlice[] = [];
  let bytes = 0;
  for (const s of dirtySlices) {
    const m = manifest.find((x) => x.slice === s);
    if (!m) continue;
    if (lastConfirmed.get(s) === m.fingerprint) continue;
    slices.push(s);
    bytes += m.byteEstimate;
  }
  return { slices, bytes };
}

/** Gap efetivo para perfil cooperado vs gestão. */
export function effectiveGap(
  slice: OperacionalSlice,
  profile: "cooperado" | "gestao"
): number {
  const p = SLICE_PRIORITY[slice];
  return PROPOSED_GAPS[p][profile];
}

/** Menor gap entre slices relevantes para uma ação (ex.: abrir votação → só P0). */
export function minGapForContext(
  slices: OperacionalSlice[],
  profile: "cooperado" | "gestao"
): number {
  if (slices.length === 0) return PROPOSED_GAPS.P2[profile];
  return Math.min(...slices.map((s) => effectiveGap(s, profile)));
}

export const PROPOSED_SCORE_NOTES: Record<string, string> = {
  coerencia:
    "Validator lab bloqueia push se ficha/pagamentos/mensalidades inconsistentes; slices reduzem blast radius de merge.",
  eficiencia:
    "Pull/push por slice; P0 8–15s; skip ~65–75% pulls redundantes na simulação 1000/20.",
  escala:
    "Manifest por slice permite sharding futuro; lista cooperados paginada (proposta); operacional não cresce monolítico na rede.",
  resiliencia:
    "Fingerprint por slice + lastConfirmed; reconexão puxa só deltas; P0 priorizado em votação/financeiro.",
  seguranca:
    "Mesma auth produção; camada extra coherenceValidator antes de push simulado.",
  observabilidade:
    "Relatório lab scoreAudit + simulate; hook futuro p/ métricas por slice (não implementado no app).",
};
