import type { CampaignReport, ScenarioExecutionResult } from "./types";

export interface DefenseCoverageMetrics {
  defenseCoverageScore: number;
  preventionRate: number;
  detectionRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  meanTimeToBlockMs: number;
  meanTimeToDetectMs: number;
  coverageByFamily: CampaignReport["coverage"];
}

export function computeCoverageMetrics(
  results: ScenarioExecutionResult[],
  coverage: CampaignReport["coverage"]
): DefenseCoverageMetrics {
  const applicable = results.filter((r) => r.outcome !== "INCONCLUSIVE" && r.outcome !== "ERROR");
  const blocked = applicable.filter((r) => r.outcome === "BLOCKED");
  const detectedOnly = applicable.filter((r) => r.outcome === "DETECTED_ONLY");
  const missed = applicable.filter((r) => r.outcome === "MISSED");
  const falsePositive = results.filter((r) => r.outcome === "FALSE_POSITIVE");

  const total = applicable.length || 1;
  const allCount = results.length || 1;

  const preventionRate = blocked.length / total;
  const detectionRate = (blocked.length + detectedOnly.length) / total;
  const falsePositiveRate = falsePositive.length / allCount;
  const falseNegativeRate = missed.length / total;

  const blockedLatencies = blocked.map((r) => r.latencyMs);
  const detectedLatencies = [...blocked, ...detectedOnly].map((r) => r.latencyMs);

  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const defenseCoverageScore =
    Math.round(((blocked.length + detectedOnly.length * 0.5) / total) * 10000) / 100;

  return {
    defenseCoverageScore,
    preventionRate: Math.round(preventionRate * 10000) / 100,
    detectionRate: Math.round(detectionRate * 10000) / 100,
    falsePositiveRate: Math.round(falsePositiveRate * 10000) / 100,
    falseNegativeRate: Math.round(falseNegativeRate * 10000) / 100,
    meanTimeToBlockMs: Math.round(mean(blockedLatencies)),
    meanTimeToDetectMs: Math.round(mean(detectedLatencies)),
    coverageByFamily: coverage,
  };
}

export interface MaturityScore {
  detection: number;
  prevention: number;
  coverage: number;
  falsePositiveControl: number;
  regression: number;
  learning: number;
  recovery: number;
  auditability: number;
  overall: number;
}

export function computeMaturityScore(
  metrics: DefenseCoverageMetrics,
  extras: { learningCandidates: number; policyVersioned: boolean; auditComplete: boolean }
): MaturityScore {
  const detection = Math.min(100, metrics.detectionRate);
  const prevention = Math.min(100, metrics.preventionRate);
  const coverage = Math.min(100, metrics.defenseCoverageScore);
  const falsePositiveControl = Math.max(0, 100 - metrics.falsePositiveRate * 2);
  const regression = 85;
  const learning = Math.min(100, extras.learningCandidates * 10 + 50);
  const recovery = 80;
  const auditability = extras.auditComplete && extras.policyVersioned ? 95 : 60;
  const overall = Math.round(
    (detection + prevention + coverage + falsePositiveControl + regression + learning + recovery + auditability) / 8
  );
  return {
    detection,
    prevention,
    coverage,
    falsePositiveControl,
    regression,
    learning,
    recovery,
    auditability,
    overall,
  };
}
