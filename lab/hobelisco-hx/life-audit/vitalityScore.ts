/** HOBELISCO_VITALITY_SCORE — métrica operacional 0–100 */

export interface VitalityDimensions {
  perception: number;
  memory: number;
  integrity: number;
  defense: number;
  recovery: number;
  learning: number;
  selfWatch: number;
}

export interface VitalityReport {
  overall: number;
  dimensions: VitalityDimensions;
  computedAt: string;
}

export function computeVitalityScore(input: Partial<VitalityDimensions>): VitalityReport {
  const dims: VitalityDimensions = {
    perception: input.perception ?? 0,
    memory: input.memory ?? 0,
    integrity: input.integrity ?? 0,
    defense: input.defense ?? 0,
    recovery: input.recovery ?? 0,
    learning: input.learning ?? 0,
    selfWatch: input.selfWatch ?? 0,
  };
  const values = Object.values(dims);
  const overall = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { overall, dimensions: dims, computedAt: new Date().toISOString() };
}

export type LifeVerdict = "LIFE-GREEN" | "LIFE-AMBER" | "LIFE-RED";

export function computeLifeVerdict(input: {
  criticalFailed: number;
  highFailed: number;
  mediumFailed: number;
  boundaryViolations: number;
  vitalityScore: number;
}): LifeVerdict {
  if (input.boundaryViolations > 0 || input.criticalFailed > 0) return "LIFE-RED";
  if (input.highFailed > 2 || input.vitalityScore < 70) return "LIFE-AMBER";
  if (input.mediumFailed > 5) return "LIFE-AMBER";
  return "LIFE-GREEN";
}
