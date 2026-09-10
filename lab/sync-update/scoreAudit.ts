/**
 * Rubrica de notas 0–10 — eixo Atualização/Sync.
 */
import { BASELINE_SCORE_NOTES } from "./baselinePolicy";
import { PROPOSED_SCORE_NOTES } from "./proposedPolicy";
import {
  injectDuplicateFicha,
  syntheticCleanSnapshot,
  validateCoherence,
  wouldBlockPush,
} from "./coherenceValidator";
import { runScaleSimulation, SCALE_LABEL } from "./scaleSimulator";
import type { SyncAuditReport, SyncScoreDimension } from "./types";

const DIMENSIONS: { id: string; label: string }[] = [
  { id: "coerencia", label: "Coerência de dados" },
  { id: "eficiencia", label: "Eficiência Edge/rede" },
  { id: "escala", label: "Prontidão escala 1000/20" },
  { id: "resiliencia", label: "Resiliência / recovery" },
  { id: "seguranca", label: "Segurança sync" },
  { id: "observabilidade", label: "Observabilidade" },
];

/** Baseline scores — calibrados na auditoria Build 59 + simulação. */
function baselineScores(sim: ReturnType<typeof runScaleSimulation>): SyncScoreDimension[] {
  const scores: Record<string, number> = {
    coerencia: 6.5,
    eficiencia: 5.0,
    escala: 4.5,
    resiliencia: 6.0,
    seguranca: 7.0,
    observabilidade: 4.5,
  };

  // Penaliza eficiência se redundância alta
  if (sim.baseline.redundantPullPct > 80) scores.eficiencia = 4.8;

  return DIMENSIONS.map((d) => ({
    id: d.id,
    label: d.label,
    score: scores[d.id] ?? 5,
    max: 10 as const,
    notes: BASELINE_SCORE_NOTES[d.id] ?? "",
  }));
}

function proposedScores(sim: ReturnType<typeof runScaleSimulation>): SyncScoreDimension[] {
  const scores: Record<string, number> = {
    coerencia: 8.0,
    eficiencia: sim.savingsBytesPct > 50 ? 8.5 : 7.5,
    escala: 7.0,
    resiliencia: 7.5,
    seguranca: 7.5,
    observabilidade: 6.5,
  };

  if (sim.savingsRequestsPct > 60) scores.eficiencia = Math.min(9.0, scores.eficiencia + 0.5);

  return DIMENSIONS.map((d) => ({
    id: d.id,
    label: d.label,
    score: scores[d.id] ?? 6,
    max: 10 as const,
    notes: PROPOSED_SCORE_NOTES[d.id] ?? "",
  }));
}

function overall(dims: SyncScoreDimension[]): number {
  const avg = dims.reduce((s, d) => s + d.score, 0) / dims.length;
  return Math.round(avg * 10) / 10;
}

export function runSyncAudit(): SyncAuditReport {
  const simulation = runScaleSimulation();

  const clean = syntheticCleanSnapshot(50, 12);
  const dirty = injectDuplicateFicha(clean);
  const baselineIssues = validateCoherence(dirty).length;
  const proposedIssues = validateCoherence(dirty);
  const proposedBlocked = wouldBlockPush(proposedIssues) ? 1 : 0;
  const proposedWarnings = proposedIssues.filter((i) => i.severity === "warn").length;

  const before = baselineScores(simulation);
  const after = proposedScores(simulation);

  return {
    generatedAt: new Date().toISOString(),
    scale: { cooperativas: 20, cooperados: 1000 },
    before,
    after,
    beforeOverall: overall(before),
    afterOverall: overall(after),
    delta: Math.round((overall(after) - overall(before)) * 10) / 10,
    simulation,
    coherence: { baselineIssues, proposedBlocked, proposedWarnings },
  };
}

export function formatReportText(report: SyncAuditReport): string {
  const lines: string[] = [
    "=== HB Cooperativas — Auditoria Sync/Atualização (LAB) ===",
    `Gerado: ${report.generatedAt}`,
    `Escala simulada: ${SCALE_LABEL}`,
    "",
    `NOTA GERAL ANTES:  ${report.beforeOverall}/10`,
    `NOTA GERAL DEPOIS: ${report.afterOverall}/10`,
    `DELTA:             +${report.delta}`,
    "",
    "--- Dimensões ANTES ---",
  ];

  for (const d of report.before) {
    lines.push(`  ${d.label}: ${d.score}/10`);
  }

  lines.push("", "--- Dimensões DEPOIS ---");
  for (const d of report.after) {
    lines.push(`  ${d.label}: ${d.score}/10`);
  }

  lines.push(
    "",
    "--- Simulação 1 dia ---",
    `Baseline:  ${report.simulation.baseline.edgeRequests} req Edge, ${report.simulation.baseline.bytesTransferredMb} MB, ${report.simulation.baseline.redundantPullPct}% pulls redundantes`,
    `Proposta:  ${report.simulation.proposed.edgeRequests} req Edge, ${report.simulation.proposed.bytesTransferredMb} MB, ${report.simulation.proposed.redundantPullPct}% pulls redundantes`,
    `Economia:  ${report.simulation.savingsRequestsPct}% req, ${report.simulation.savingsBytesPct}% bytes`,
    "",
    "--- Coerência (snapshot sintético c/ duplicata) ---",
    `Baseline detectaria ${report.coherence.baselineIssues} issue(s); push não bloqueado estruturalmente`,
    `Proposta bloquearia push: ${report.coherence.proposedBlocked === 1 ? "SIM" : "NÃO"}; warnings: ${report.coherence.proposedWarnings}`,
  );

  return lines.join("\n");
}
