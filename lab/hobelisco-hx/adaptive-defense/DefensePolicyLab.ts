import type { DefenseLearningCandidate, GeneratedScenario, ScenarioExecutionResult } from "./types";
import { compareDefenses } from "../evolution/EvolutionEngine";
import type { DefenseRecord } from "../reincarnation/DefenseRegistry";
import { getActivePolicy, verifyPolicyIntegrity } from "./DefensePolicyStore";

export interface PolicyLabResult {
  ok: boolean;
  stages: Array<{ stage: string; pass: boolean; detail: string }>;
  recommendation: "APPROVE" | "REJECT" | "PROPOSED";
}

export function validatePolicyCandidate(
  baselineMetrics: DefenseRecord["metrics"],
  candidateMetrics: DefenseRecord["metrics"],
  falsePositiveRate: number
): PolicyLabResult {
  const stages: PolicyLabResult["stages"] = [];
  const policy = getActivePolicy();

  stages.push({
    stage: "STATIC_CHECK",
    pass: verifyPolicyIntegrity(policy),
    detail: verifyPolicyIntegrity(policy) ? "policy hash valid" : "policy tampered",
  });

  stages.push({
    stage: "FALSE_POSITIVE_TEST",
    pass: falsePositiveRate <= 0.15,
    detail: `FP rate ${(falsePositiveRate * 100).toFixed(1)}%`,
  });

  const comparison = compareDefenses(
    { id: "baseline", version: "v1", status: "validated", notes: [], metrics: baselineMetrics },
    { id: "candidate", version: "v2", status: "arena", parentDefenseId: "baseline", notes: [], metrics: candidateMetrics }
  );

  stages.push({
    stage: "REGRESSION",
    pass: comparison.decision !== "REJECTED",
    detail: comparison.reason,
  });

  const ok = stages.every((s) => s.pass);
  return {
    ok,
    stages,
    recommendation: comparison.decision === "VALIDATED" && ok ? "APPROVE" : comparison.decision === "REJECTED" ? "REJECT" : "PROPOSED",
  };
}

export function proposeLearningFromGap(
  missed: ScenarioExecutionResult[],
  scenarios: GeneratedScenario[]
): DefenseLearningCandidate[] {
  const byFamily = new Map<string, number>();
  for (const m of missed) {
    const sc = scenarios.find((s) => s.scenarioId === m.scenarioId);
    if (!sc || sc.isLegitimate) continue;
    byFamily.set(sc.family, (byFamily.get(sc.family) ?? 0) + 1);
  }

  const candidates: DefenseLearningCandidate[] = [];
  for (const [family, count] of byFamily) {
    if (count < 2) continue;
    candidates.push({
      id: `learn_${family}_${Date.now()}`,
      sourceIncidentIds: [],
      sourceScenarioIds: missed.filter((m) => scenarios.find((s) => s.scenarioId === m.scenarioId)?.family === family).map((m) => m.scenarioId),
      attackFamily: family as DefenseLearningCandidate["attackFamily"],
      observedPattern: `${count} missed scenarios in ${family}`,
      proposedDefense: `Strengthen ${family} correlation threshold + active ${family.includes("AUTH") ? "RATE_LIMIT" : "REJECT"}`,
      expectedBenefit: `Reduce missed rate for ${family}`,
      falsePositiveRisk: "MEDIUM",
      confidence: Math.min(0.85, 0.4 + count * 0.05),
      createdAt: new Date().toISOString(),
      status: "PROPOSED",
    });
  }
  return candidates;
}
