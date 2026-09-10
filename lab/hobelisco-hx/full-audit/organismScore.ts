import type { OrganismTestResult } from "./types";
import { recordOrganismTest } from "./types";

export function computeOrganismReadinessScore(input: {
  life: number;
  perception: number;
  memory: number;
  defense: number;
  recovery: number;
  evolution: number;
  selfWatch: number;
  integrity: number;
  boundary: number;
  arena: number;
}): { score: number; formula: string; dimensions: Record<string, number> } {
  const dimensions = {
    LIFE: input.life,
    PERCEPTION: input.perception,
    MEMORY: input.memory,
    DEFENSE: input.defense,
    RECOVERY: input.recovery,
    EVOLUTION: input.evolution,
    SELF_WATCH: input.selfWatch,
    INTEGRITY: input.integrity,
    BOUNDARY: input.boundary,
    ARENA: input.arena,
  };
  const values = Object.values(dimensions);
  const score = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const formula = "mean(LIFE,PERCEPTION,MEMORY,DEFENSE,RECOVERY,EVOLUTION,SELF_WATCH,INTEGRITY,BOUNDARY,ARENA)";
  return { score, formula, dimensions };
}

export function computeOrganismVerdict(input: {
  criticalFailed: number;
  boundaryViolation: boolean;
  financialMutation: boolean;
  productionAccess: boolean;
  lifeRegression: boolean;
  arenaRegression: boolean;
  score: number;
}): import("./types").OrganismVerdict {
  if (
    input.boundaryViolation ||
    input.financialMutation ||
    input.productionAccess ||
    input.criticalFailed > 0 ||
    input.lifeRegression ||
    input.arenaRegression
  ) {
    return "ORGANISM-RED";
  }
  if (input.score >= 75) return "ORGANISM-GREEN";
  return "ORGANISM-AMBER";
}

export function computeImmunityReadiness(input: {
  knownPatterns: number;
  validatedAntibodies: number;
  survival: number;
  containment: number;
  recovery: number;
  falsePositive: number;
}): { score: number; experimental: true; label: string } {
  const score = Math.round(
    (input.knownPatterns * 0.1 +
      input.validatedAntibodies * 5 +
      input.survival * 0.3 +
      input.containment * 0.25 +
      input.recovery * 0.2 -
      input.falsePositive * 0.1) /
      2
  );
  return {
    score: Math.max(0, Math.min(100, score)),
    experimental: true,
    label: "IMMUNITY_READINESS — experimental laboratory metric, not a security guarantee",
  };
}

export function dimensionFromTests(tests: OrganismTestResult[], prefix: string, fallback = 70): number {
  const relevant = tests.filter((t) => t.id.includes(prefix) || t.name.toLowerCase().includes(prefix.toLowerCase()));
  if (relevant.length === 0) return fallback;
  const passRate = relevant.filter((t) => t.status === "PASS").length / relevant.length;
  return Math.round(passRate * 100);
}

export { recordOrganismTest };
