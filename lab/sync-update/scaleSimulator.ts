/**
 * Simula um dia operacional: 20 cooperativas × 50 cooperados = 1000.
 * Compara baseline (monolito) vs proposta (slices seletivos).
 */
import { baselinePullBytes, baselineRedundantPullPct, BASELINE_GAPS } from "./baselinePolicy";
import { planSelectivePull, planSelectivePush, PROPOSED_SLICE_ORDER } from "./proposedPolicy";
import type { OperacionalSlice, ScaleSimulationResult, SliceManifest } from "./types";

const COOPERATIVAS = 20;
const COOPERADOS_POR_COOP = 50;
const TOTAL_COOPERADOS = COOPERATIVAS * COOPERADOS_POR_COOP;

/** Tamanhos médios por slice (bytes) — calibrado ~850 KB / 27 coop → escala linear. */
function buildManifest(coopCount: number): SliceManifest[] {
  const scale = coopCount / 27;
  const base: Record<OperacionalSlice, number> = {
    votacao: 80_000,
    financeiro: 120_000,
    ficha: 400_000,
    comunicados: 60_000,
    cadastro: 150_000,
    outros: 40_000,
  };
  const now = new Date().toISOString();
  return PROPOSED_SLICE_ORDER.map((slice) => ({
    slice,
    fingerprint: `fp-${slice}-v1`,
    byteEstimate: Math.round(base[slice] * scale),
    updatedAt: now,
  }));
}

function hashSlice(slice: OperacionalSlice, version: number): string {
  return `fp-${slice}-v${version}`;
}

interface SimEvent {
  kind: "cooperado_open" | "gestao_open" | "gestao_edit" | "votacao_tick";
  coopIndex: number;
  atMs: number;
}

function generateDayEvents(): SimEvent[] {
  const events: SimEvent[] = [];
  let t = 0;

  // Manhã: 70% cooperados abrem app (1 sync cada)
  for (let c = 0; c < TOTAL_COOPERADOS * 0.7; c++) {
    events.push({
      kind: "cooperado_open",
      coopIndex: c % COOPERATIVAS,
      atMs: t + (c % 120) * 1000,
    });
  }
  t += 130_000;

  // Gestores: 20 responsáveis, ~40 sessões/dia cada (gap 25s baseline)
  for (let g = 0; g < COOPERATIVAS; g++) {
    for (let s = 0; s < 40; s++) {
      events.push({ kind: "gestao_open", coopIndex: g, atMs: t + s * BASELINE_GAPS.gestao });
      if (s % 5 === 0) {
        events.push({ kind: "gestao_edit", coopIndex: g, atMs: t + s * BASELINE_GAPS.gestao + 500 });
      }
    }
  }
  t += 40 * BASELINE_GAPS.gestao;

  // Votação ativa: pull operacional a cada 25s × 20 coops × 60 min simulados (144 ticks/coop)
  for (let g = 0; g < COOPERATIVAS; g++) {
    for (let tick = 0; tick < 144; tick++) {
      events.push({
        kind: "votacao_tick",
        coopIndex: g,
        atMs: t + tick * BASELINE_GAPS.votacaoPull,
      });
    }
  }

  return events.sort((a, b) => a.atMs - b.atMs);
}

function simulateBaseline(manifest: SliceManifest[], events: SimEvent[]): ScaleSimulationResult["baseline"] {
  let edgeRequests = 0;
  let bytes = 0;
  let redundant = 0;
  let totalPulls = 0;

  const fullBytes = baselinePullBytes(manifest);
  const lastRemoteFp = manifest.map((m) => m.fingerprint).join("|");

  for (const ev of events) {
    if (ev.kind === "cooperado_open") {
      edgeRequests += 2; // pull + push attempt
      bytes += fullBytes * 2;
      totalPulls++;
      redundant++; // cooperado raramente muda remoto entre opens
    } else if (ev.kind === "gestao_open" || ev.kind === "votacao_tick") {
      edgeRequests += 1;
      bytes += fullBytes;
      totalPulls++;
      redundant++; // mesmo fingerprint remoto na maioria dos ticks
    } else if (ev.kind === "gestao_edit") {
      edgeRequests += 2;
      bytes += fullBytes * 2;
      totalPulls++;
    }
  }

  void lastRemoteFp;
  return {
    edgeRequests,
    bytesTransferredMb: Math.round((bytes / (1024 * 1024)) * 100) / 100,
    redundantPullPct: baselineRedundantPullPct(redundant, totalPulls),
  };
}

function simulateProposed(manifest: SliceManifest[], events: SimEvent[]): ScaleSimulationResult["proposed"] {
  let edgeRequests = 0;
  let bytes = 0;
  let redundant = 0;
  let totalPulls = 0;

  // Remote muda só votacao (v2) após 2h simuladas e financeiro (v2) em edits esporádicos
  let remote = manifest.map((m) => ({ ...m }));
  const remoteVersions: Record<OperacionalSlice, number> = {
    votacao: 1,
    financeiro: 1,
    ficha: 1,
    comunicados: 1,
    cadastro: 1,
    outros: 1,
  };

  let editCount = 0;
  const lastConfirmed = new Map<OperacionalSlice, string>(
    manifest.map((m) => [m.slice, m.fingerprint])
  );

  for (const ev of events) {
    if (ev.kind === "gestao_edit") {
      editCount++;
      if (editCount % 3 === 0) {
        remoteVersions.financeiro++;
        const idx = remote.findIndex((m) => m.slice === "financeiro");
        remote[idx] = {
          ...remote[idx],
          fingerprint: hashSlice("financeiro", remoteVersions.financeiro),
          byteEstimate: remote[idx].byteEstimate,
        };
      }
    }
    if (ev.kind === "votacao_tick" && ev.atMs > 7200_000) {
      remoteVersions.votacao = 2;
      const idx = remote.findIndex((m) => m.slice === "votacao");
      if (remote[idx].fingerprint !== hashSlice("votacao", 2)) {
        remote[idx] = {
          ...remote[idx],
          fingerprint: hashSlice("votacao", 2),
        };
      }
    }

    const local = manifest;
    const contextSlices: OperacionalSlice[] =
      ev.kind === "votacao_tick"
        ? ["votacao"]
        : ev.kind === "cooperado_open"
          ? ["comunicados", "ficha", "financeiro"]
          : ev.kind === "gestao_edit"
            ? ["financeiro", "ficha"]
            : ["votacao", "financeiro", "ficha", "comunicados"];

    const pull = planSelectivePull(local, remote, ev.kind === "votacao_tick" ? ["votacao"] : undefined);
    const relevantPull = {
      ...pull,
      slices: pull.slices.filter((s) => contextSlices.includes(s)),
      bytes: pull.slices
        .filter((s) => contextSlices.includes(s))
        .reduce((sum, s) => sum + (remote.find((m) => m.slice === s)?.byteEstimate ?? 0), 0),
    };

    if (relevantPull.slices.length === 0) {
      redundant++;
    }
    totalPulls++;
    edgeRequests += 1;
    bytes += relevantPull.bytes;

    if (ev.kind === "gestao_edit") {
      const dirty: OperacionalSlice[] = ["financeiro"];
      const push = planSelectivePush(local, dirty, lastConfirmed);
      if (push.slices.length > 0) {
        edgeRequests += 1;
        bytes += push.bytes;
        for (const s of push.slices) {
          const m = local.find((x) => x.slice === s);
          if (m) lastConfirmed.set(s, m.fingerprint);
        }
      }
    }
  }

  return {
    edgeRequests,
    bytesTransferredMb: Math.round((bytes / (1024 * 1024)) * 100) / 100,
    redundantPullPct: baselineRedundantPullPct(redundant, totalPulls),
  };
}

export function runScaleSimulation(): ScaleSimulationResult {
  const manifest = buildManifest(COOPERADOS_POR_COOP);
  const events = generateDayEvents();

  const baseline = simulateBaseline(manifest, events);
  const proposed = simulateProposed(manifest, events);

  const savingsRequestsPct =
    baseline.edgeRequests > 0
      ? Math.round((1 - proposed.edgeRequests / baseline.edgeRequests) * 1000) / 10
      : 0;
  const savingsBytesPct =
    baseline.bytesTransferredMb > 0
      ? Math.round((1 - proposed.bytesTransferredMb / baseline.bytesTransferredMb) * 1000) / 10
      : 0;

  return {
    baseline,
    proposed,
    savingsRequestsPct,
    savingsBytesPct,
  };
}

export const SCALE_LABEL = `${TOTAL_COOPERADOS} cooperados · ${COOPERATIVAS} cooperativas`;
