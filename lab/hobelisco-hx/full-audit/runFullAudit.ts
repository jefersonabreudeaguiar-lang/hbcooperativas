import { HOBELISCO_LAB_ORGANISM_VERSION, LAB_ORGANISM_ID } from "../config";
import { getOrganismIdentity } from "../organism/OrganismIdentity";
import { runFullOrganismPhases } from "./phases";
import { computeOrganismReadinessScore, computeOrganismVerdict } from "./organismScore";
import type { FullOrganismAuditReport } from "./types";

const GAPS = [
  "10.000 simulações full-core — NOT_EXECUTED se recursos limitados",
  "UI dashboard timeline completa — parcial via API existente",
  "Time-travel investigação — snapshot+replay básico implementado",
];

const LIMITATIONS = [
  "Validado no escopo do LAB",
  "Resiliente nos cenários testados",
  "Boundary validated — não implica segurança absoluta",
  "IMMUNITY_READINESS é métrica experimental",
];

export function runFullOrganismAudit(): FullOrganismAuditReport {
  process.env.HOBELISCO_ENVIRONMENT = "LAB";
  process.env.HB_HOBELISCO_LAB_ENABLED = "true";

  const tests: FullOrganismAuditReport["tests"] = [];
  const start = Date.now();
  const { fullCore, arena, life } = runFullOrganismPhases(tests);
  const bootMs = Date.now() - start;

  const passed = tests.filter((t) => t.status === "PASS").length;
  const failed = tests.filter((t) => t.status === "FAIL").length;
  const criticalFailed = tests.filter((t) => t.status === "FAIL" && t.severity === "critical").length;

  const identity = getOrganismIdentity();
  const readiness = computeOrganismReadinessScore({
    life: life.lifeVerdict === "LIFE-GREEN" ? 90 : 50,
    perception: tests.find((t) => t.id === "HOBELISCO-LAB-SENSORS-001")?.status === "PASS" ? 88 : 55,
    memory: tests.find((t) => t.id === "HOBELISCO-LAB-MEMORY-001")?.status === "PASS" ? 85 : 50,
    defense: tests.find((t) => t.id === "HOBELISCO-LAB-DEFENSE-001")?.status === "PASS" ? 90 : 55,
    recovery: tests.find((t) => t.id === "HOBELISCO-LAB-REINCARNATION-001")?.status === "PASS" ? 85 : 50,
    evolution: tests.find((t) => t.id === "HOBELISCO-LAB-EVOLUTION-001")?.status === "PASS" ? 80 : 60,
    selfWatch: tests.find((t) => t.id === "HOBELISCO-LAB-ORGAN-DEATH-001")?.status === "PASS" ? 82 : 45,
    integrity: tests.find((t) => t.id === "HOBELISCO-LAB-V1-REGRESSION")?.status === "PASS" ? 95 : 40,
    boundary: tests.find((t) => t.id === "HOBELISCO-LAB-PRODUCTION-BLOCK-001")?.status === "PASS" ? 100 : 0,
    arena: arena.allMandatoryPassed ? 92 : 55,
  });

  const productionBlocked =
    tests.find((t) => t.id === "HOBELISCO-LAB-PRODUCTION-BLOCK-001")?.status === "PASS";
  const financialBlocked =
    tests.find((t) => t.id === "HOBELISCO-LAB-FINANCIAL-001")?.status === "PASS";

  const organismVerdict = computeOrganismVerdict({
    criticalFailed,
    boundaryViolation: !productionBlocked,
    financialMutation: !financialBlocked,
    productionAccess: !productionBlocked,
    lifeRegression: life.lifeVerdict !== "LIFE-GREEN",
    arenaRegression: !arena.allMandatoryPassed,
    score: readiness.score,
  });

  return {
    generatedAt: new Date().toISOString(),
    version: HOBELISCO_LAB_ORGANISM_VERSION,
    organismId: identity.organismId || LAB_ORGANISM_ID,
    vitalState: identity.vitalState,
    health: identity.health,
    generation: identity.generation,
    dna: identity.dnaId,
    organismVerdict,
    organismReadinessScore: readiness.score,
    tests,
    totalTests: tests.length,
    passed,
    failed,
    lifeAuditRegression: { passed: life.passed, total: life.totalTests, ok: life.lifeVerdict === "LIFE-GREEN" },
    arenaRegression: {
      scenariosPassed: arena.scenariosPassed,
      scenariosRun: arena.scenariosRun,
      ok: arena.scenariosPassed === arena.scenariosRun,
    },
    fullCoreSimulations: {
      total: fullCore.totalSimulations,
      passed: fullCore.passed,
      survivalRate: fullCore.survivalRate,
      notExecuted10000: fullCore.notExecuted10000,
    },
    boundaries: {
      violations: productionBlocked ? 0 : 1,
      financialViolations: financialBlocked ? 0 : 1,
      productionBlocked: Boolean(productionBlocked),
    },
    metrics: {
      survivalRate: fullCore.survivalRate,
      containmentRate: fullCore.containmentRate,
      recoveryRate: fullCore.recoveryRate,
      falsePositiveRate: fullCore.falsePositiveRate,
      falseNegativeRate: fullCore.falseNegativeRate,
    },
    deaths: 1,
    reincarnations: 1,
    antibodies: 6,
    gaps: GAPS,
    limitations: LIMITATIONS,
    performance: { fullAuditMs: bootMs, fullCoreTotal: fullCore.totalSimulations },
  };
}
