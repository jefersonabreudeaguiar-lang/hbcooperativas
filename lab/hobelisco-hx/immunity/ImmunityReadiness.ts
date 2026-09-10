/** Immunity Readiness — métrica experimental, não garantia de segurança */

export type ImmunityClass = "IMMATURE" | "DEVELOPING" | "RESILIENT" | "HIGHLY_RESILIENT";

export interface ImmunityDimensions {
  detection: number;
  containment: number;
  recovery: number;
  learning: number;
  resilience: number;
  auditability: number;
  isolation: number;
  financialSafety: number;
}

export interface ImmunityReadinessReport {
  score: number;
  classification: ImmunityClass;
  dimensions: ImmunityDimensions;
  experimental: true;
  label: string;
  formula: string;
}

export function computeImmunityReadiness(input: Partial<ImmunityDimensions> & {
  knownPatterns?: number;
  validatedAntibodies?: number;
  survivalRate?: number;
}): ImmunityReadinessReport {
  const dims: ImmunityDimensions = {
    detection: input.detection ?? Math.min(100, (input.knownPatterns ?? 5) * 8),
    containment: input.containment ?? input.survivalRate ?? 70,
    recovery: input.recovery ?? 65,
    learning: input.learning ?? 60,
    resilience: input.resilience ?? 70,
    auditability: input.auditability ?? 90,
    isolation: input.isolation ?? 85,
    financialSafety: input.financialSafety ?? 100,
  };

  const antibodyBoost = Math.min(15, (input.validatedAntibodies ?? 0) * 3);
  const values = Object.values(dims);
  const score = Math.round(values.reduce((a, b) => a + b, 0) / values.length + antibodyBoost);
  const clamped = Math.max(0, Math.min(100, score));

  let classification: ImmunityClass = "IMMATURE";
  if (clamped >= 85) classification = "HIGHLY_RESILIENT";
  else if (clamped >= 70) classification = "RESILIENT";
  else if (clamped >= 50) classification = "DEVELOPING";

  return {
    score: clamped,
    classification,
    dimensions: dims,
    experimental: true,
    label: "IMMUNITY_READINESS — experimental laboratory metric, not a security guarantee",
    formula: "mean(detection,containment,recovery,learning,resilience,auditability,isolation,financialSafety)+antibodyBoost",
  };
}
