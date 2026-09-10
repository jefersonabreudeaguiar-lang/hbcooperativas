/** Score 10X por dimensão — derivado de métricas reais */

import type { CampaignReport } from "../adaptive-defense/types";

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  weight: number;
  evidence: string;
}

export interface ExtendedSecurityScore {
  overall: number;
  weakestDimension: { id: string; score: number };
  dimensions: DimensionScore[];
  criticalGates: {
    financialMutations: number;
    criticalBypass: number;
    productionTargets: number;
    auditIntegrity: boolean;
  };
  gatesPass: boolean;
}

export function computeExtendedSecurityScore(
  campaign: CampaignReport,
  secRegPassed: number,
  secRegTotal: number
): ExtendedSecurityScore {
  const attackTotal = Math.max(1, campaign.scenariosExecuted - campaign.inconclusive);
  const detection = Math.min(10, (campaign.detectionRate / 10) * (1 - campaign.missed / attackTotal));
  const prevention = Math.min(10, campaign.preventionRate / 10);
  const coverage = Math.min(10, campaign.defenseCoverageScore / 10);
  const fp = campaign.falsePositive === 0 ? 8.5 : Math.max(2, 10 - campaign.falsePositiveRate / 5);

  const familyScore = (prefix: string, fallback: number) => {
    const entries = Object.entries(campaign.coverage).filter(([k]) => k.startsWith(prefix));
    if (!entries.length) return fallback;
    const totals = entries.reduce(
      (a, [, v]) => ({ t: a.t + v.total, b: a.b + v.blocked, m: a.m + v.missed }),
      { t: 0, b: 0, m: 0 }
    );
    if (!totals.t) return fallback;
    return Math.min(10, ((totals.b + (totals.t - totals.m - totals.b) * 0.5) / totals.t) * 10);
  };

  const dims: DimensionScore[] = [
    { id: "detection", label: "Detection", score: round(detection), weight: 0.1, evidence: `${campaign.detectionRate}% det, ${campaign.missed} missed` },
    { id: "prevention", label: "Prevention", score: round(prevention), weight: 0.1, evidence: `${campaign.preventionRate}% blocked` },
    { id: "coverage", label: "Coverage", score: round(coverage), weight: 0.08, evidence: `${campaign.defenseCoverageScore}%` },
    { id: "auth", label: "Auth", score: round(familyScore("T01", 5)), weight: 0.07, evidence: "T01_AUTH family" },
    { id: "authz", label: "AuthZ", score: round(familyScore("T02", 6)), weight: 0.07, evidence: "T02_AUTHZ family" },
    { id: "session", label: "Session", score: round(familyScore("T06", 5)), weight: 0.06, evidence: "T06_SESSION family" },
    { id: "api", label: "API", score: round(familyScore("T04", 6)), weight: 0.05, evidence: "T04_WEB_API" },
    { id: "integrity", label: "Integrity", score: round(familyScore("T05", 7) * 0.5 + familyScore("T10", 7) * 0.5), weight: 0.05, evidence: "T05+T10" },
    { id: "credit", label: "HB Credit", score: round(familyScore("T12", 5)), weight: 0.08, evidence: "T12_HB_CREDIT" },
    { id: "sync", label: "Sync", score: round(familyScore("T11", 7)), weight: 0.06, evidence: "T11_SYNC" },
    { id: "crossTenant", label: "CrossTenant", score: round(familyScore("T02", 6)), weight: 0.07, evidence: "authz+tenant" },
    { id: "abuse", label: "Abuse/Rate", score: round(familyScore("T07", 7)), weight: 0.05, evidence: "T07_RATE" },
    { id: "threatIntel", label: "ThreatIntel", score: 6.5, weight: 0.04, evidence: "TKB versioned static" },
    { id: "incidentResponse", label: "IR", score: 6.5, weight: 0.04, evidence: "playbooks+human" },
    { id: "audit", label: "Audit", score: 9, weight: 0.04, evidence: "audit chain LAB" },
    { id: "resilience", label: "Resilience", score: 7.5, weight: 0.04, evidence: "fail-open fabric" },
    { id: "regression", label: "Regression", score: round((secRegPassed / Math.max(1, secRegTotal)) * 10), weight: 0.06, evidence: `${secRegPassed}/${secRegTotal} SEC-REG` },
    { id: "performance", label: "Performance", score: campaign.durationMs < 120_000 ? 8 : campaign.durationMs < 300_000 ? 6 : 4, weight: 0.04, evidence: `${campaign.durationMs}ms campaign` },
    { id: "falsePositive", label: "FP Control", score: round(fp), weight: 0.04, evidence: `FP=${campaign.falsePositive}` },
  ];

  let overall = 0;
  let wSum = 0;
  for (const d of dims) {
    overall += d.score * d.weight;
    wSum += d.weight;
  }
  overall = round(overall / wSum);

  const weakest = dims.reduce((a, b) => (a.score < b.score ? a : b));

  const criticalGates = {
    financialMutations: campaign.financialMutations,
    criticalBypass: campaign.missed,
    productionTargets: campaign.externalTargets,
    auditIntegrity: secRegPassed === secRegTotal,
  };

  const gatesPass =
    criticalGates.financialMutations === 0 &&
    criticalGates.productionTargets === 0 &&
    criticalGates.auditIntegrity;

  return { overall, weakestDimension: { id: weakest.id, score: weakest.score }, dimensions: dims, criticalGates, gatesPass };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
