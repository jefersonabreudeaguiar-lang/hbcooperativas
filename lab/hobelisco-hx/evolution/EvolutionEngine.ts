/** Evolution Engine — compara defesas sem promover para produção */

import { computeMetrics, type DefenseMetrics, type DefenseRecord } from "../reincarnation/DefenseRegistry";

export type EvolutionDecision = "REJECTED" | "PROPOSED" | "VALIDATED";

export interface EvolutionComparison {
  defenseA: string;
  defenseB: string;
  parent: string | null;
  child: string;
  metricsA: DefenseMetrics;
  metricsB: DefenseMetrics;
  winner: string | null;
  decision: EvolutionDecision;
  reason: string;
  limitations: string[];
}

function isSuperior(a: DefenseMetrics, b: DefenseMetrics): boolean {
  const improvements =
    (b.survivalRate > a.survivalRate ? 1 : 0) +
    (b.containmentRate > a.containmentRate ? 1 : 0) +
    (b.recoveryRate > a.recoveryRate ? 1 : 0) +
    (b.falsePositiveRate < a.falsePositiveRate ? 1 : 0) +
    (b.falseNegativeRate < a.falseNegativeRate ? 1 : 0);
  const regressions =
    (b.survivalRate < a.survivalRate ? 1 : 0) +
    (b.containmentRate < a.containmentRate ? 1 : 0) +
    (b.recoveryRate < a.recoveryRate ? 1 : 0);
  return improvements >= 3 && regressions === 0;
}

export function compareDefenses(
  a: DefenseRecord,
  b: DefenseRecord
): EvolutionComparison {
  const superior = isSuperior(a.metrics, b.metrics);
  const inferior = isSuperior(b.metrics, a.metrics);

  let decision: EvolutionDecision = "PROPOSED";
  let winner: string | null = null;
  let reason: string;

  if (inferior) {
    decision = "REJECTED";
    winner = a.id;
    reason = `${b.id} pior que ${a.id} em métricas agregadas`;
  } else if (superior) {
    decision = "VALIDATED";
    winner = b.id;
    reason = `${b.id} superior a ${a.id} em múltiplas dimensões`;
  } else {
    decision = "PROPOSED";
    reason = "Sem melhoria clara em múltiplas dimensões — permanece PROPOSED";
  }

  return {
    defenseA: a.id,
    defenseB: b.id,
    parent: b.parentDefenseId ?? a.id,
    child: b.id,
    metricsA: a.metrics,
    metricsB: b.metrics,
    winner,
    decision,
    reason,
    limitations: ["Validado apenas no escopo LAB", "Não promove para produção"],
  };
}

export function buildEvolutionReport(comparisons: EvolutionComparison[]): {
  generatedAt: string;
  comparisons: EvolutionComparison[];
  validated: number;
  rejected: number;
  proposed: number;
} {
  return {
    generatedAt: new Date().toISOString(),
    comparisons,
    validated: comparisons.filter((c) => c.decision === "VALIDATED").length,
    rejected: comparisons.filter((c) => c.decision === "REJECTED").length,
    proposed: comparisons.filter((c) => c.decision === "PROPOSED").length,
  };
}

export { computeMetrics };
