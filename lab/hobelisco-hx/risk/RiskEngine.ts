/** Risk Engine — L0 a L3 */

import type { HobeliscoRule, RiskLevel } from "../types";

export function classifyRisk(matchedRules: HobeliscoRule[]): RiskLevel {
  if (matchedRules.some((r) => r.severity === "critical")) return "L3_HUMAN_REQUIRED";
  if (matchedRules.some((r) => r.recommendedAction === "L2_SAFE_REPAIR")) return "L2_SAFE_REPAIR";
  if (matchedRules.some((r) => r.recommendedAction === "L1_PREVENT")) return "L1_PREVENT";
  return "L0_OBSERVE";
}

export function riskAllowsAutoRepair(level: RiskLevel): boolean {
  return level === "L2_SAFE_REPAIR";
}

export function riskAllowsFinancialRepair(_level: RiskLevel): boolean {
  return false;
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  L0_OBSERVE: "Observar",
  L1_PREVENT: "Prevenir",
  L2_SAFE_REPAIR: "Reparo seguro reversível",
  L3_HUMAN_REQUIRED: "Humano obrigatório",
};
