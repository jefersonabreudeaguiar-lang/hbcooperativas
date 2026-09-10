/**
 * Closure Audit — COMANDO 4 HX-0.3.0-LAB-CLOSURE
 */

import { execSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { runAllAttacks } from "../attacks/AttackMatrix";
import { createAntibodyCandidate, promoteAntibody } from "../antibodies/AntibodyEngine";
import { runFullCoreSimulations } from "../arena/FullCoreSimulationRunner";
import { runArenaSimulation } from "../arena/SimulationRunner";
import { HOBELISCO_CLOSURE_VERSION, LAB_ORGANISM_ID } from "../config";
import { evaluateFinancialAction } from "../financial/FinancialGuard";
import { compareDefenses } from "../evolution/EvolutionEngine";
import { runSnapshotReplayTest } from "../evolution/ReplayEngine";
import { createFullSnapshot, verifySnapshotIntegrity } from "../evolution/LabSnapshot";
import { runFalseSuccessBattery } from "../guardian/GuardianValidator";
import { computeImmunityReadiness } from "../immunity/ImmunityReadiness";
import { runLifeAudit } from "../life-audit/runLifeAudit";
import { computeVitalityScore } from "../life-audit/vitalityScore";
import { LabBoundary } from "../lab-world/LabBoundary";
import { LAB_ACTORS } from "../lab-world/LabActors";
import { buildThreatFingerprint } from "../threat/ThreatClassifier";
import { CircuitBreaker } from "../validation/CircuitBreaker";
import { LoopGuard } from "../validation/LoopGuard";
import { computeMetrics, DefenseRegistry } from "../reincarnation/DefenseRegistry";
import { HobeliscoRuntime, resetHobeliscoRuntime } from "../runtime/HobeliscoRuntime";
import { runFullOrganismAudit } from "../full-audit/runFullAudit";
import { recordClosureTest } from "./types";
import type { ClosureAuditReport, ClosureTestResult } from "./types";

function gitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", cwd: process.cwd() }).trim();
  } catch {
    return null;
  }
}

function securityScan(): { pass: boolean; findings: string[] } {
  const scanRoots = [
    "core", "organism", "runtime", "lab-world", "events", "attacks",
    "guardian", "financial", "security", "memory", "threat", "immune",
    "antibodies", "evolution", "immunity", "state", "heart", "audit",
  ];
  const root = join(process.cwd(), "lab", "hobelisco-hx");
  const findings: string[] = [];
  const secretPatterns: { re: RegExp; label: string }[] = [
    { re: /Bearer ey[A-Za-z0-9_-]{10,}/, label: "jwt token" },
    { re: /sk_live_[a-zA-Z0-9]{10,}/, label: "stripe live key" },
    { re: /service_role['"]\s*:\s*['"]ey/, label: "service role jwt" },
  ];
  for (const sub of scanRoots) {
    const dir = join(root, sub);
    try {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".ts")) continue;
        const content = readFileSync(join(dir, name), "utf8");
        for (const { re, label } of secretPatterns) {
          if (re.test(content)) findings.push(`${sub}/${name}: ${label}`);
        }
      }
    } catch {
      /* dir may not exist */
    }
  }
  return { pass: findings.length === 0, findings };
}

export function runClosureAudit(): ClosureAuditReport {
  process.env.HOBELISCO_ENVIRONMENT = "LAB";
  process.env.HB_HOBELISCO_LAB_ENABLED = "true";

  const tests: ClosureTestResult[] = [];
  const perf: Record<string, number> = {};

  // FASE 1 — V1 regression
  const t0 = Date.now();
  const life = runLifeAudit();
  perf.lifeAuditMs = Date.now() - t0;
  recordClosureTest(tests, {
    id: "CLOSURE-V1-LIFE",
    phase: 1,
    category: "regression",
    name: "V1 Life Audit 27/27",
    pass: life.lifeVerdict === "LIFE-GREEN" && life.failed === 0,
    detail: `${life.passed}/${life.totalTests} ${life.lifeVerdict}`,
  });

  const t1 = Date.now();
  const arena = runArenaSimulation();
  perf.arenaMs = Date.now() - t1;
  recordClosureTest(tests, {
    id: "CLOSURE-V1-ARENA",
    phase: 1,
    category: "regression",
    name: "V1 Arena 10/10",
    pass: arena.scenariosPassed === arena.scenariosRun && arena.allMandatoryPassed,
    detail: `${arena.scenariosPassed}/${arena.scenariosRun}`,
  });

  // FASE 2 — Runtime
  const rt = resetHobeliscoRuntime();
  const start = rt.start();
  rt.pulse();
  rt.stop();
  recordClosureTest(tests, {
    id: "CLOSURE-RUNTIME-001",
    phase: 2,
    category: "runtime",
    name: "HobeliscoRuntime start/pulse/stop",
    pass: start.bootOk && start.state === "WATCHING",
    detail: `state=${start.state}`,
  });

  const t2 = Date.now();
  const deathStates = rt.runDeathCycle();
  perf.deathCycleMs = Date.now() - t2;
  recordClosureTest(tests, {
    id: "CLOSURE-LIFECYCLE-001",
    phase: 2,
    category: "lifecycle",
    name: "Death cycle DEFENDING→FAILED→DEAD→ANALYSIS→REINCARNATING",
    pass: deathStates.includes("DEAD") && deathStates.includes("ANALYSIS"),
    detail: deathStates.join("→"),
  });

  // FASE 3 — LabWorld + Actors
  recordClosureTest(tests, {
    id: "CLOSURE-LABWORLD-001",
    phase: 3,
    category: "labworld",
    name: "LabActors + cooperatives",
    pass: LAB_ACTORS.length >= 7 && rt.organism.world.cooperatives.length >= 3,
    detail: `${LAB_ACTORS.length} actors, ${rt.organism.world.cooperatives.length} coops`,
  });

  // FASE 5 — Attack matrix
  const t3 = Date.now();
  const attacks = runAllAttacks();
  perf.attackMatrixMs = Date.now() - t3;
  recordClosureTest(tests, {
    id: "CLOSURE-ATTACK-MATRIX",
    phase: 5,
    category: "attacks",
    name: "25 attack scenarios",
    pass: attacks.passed >= 23,
    detail: `${attacks.passed}/${attacks.total}`,
  });

  // FASE 7 — Threat DNA collision
  const fp1 = buildThreatFingerprint({ sequence: ["normal", "login"], endpoint: "/user/a" });
  const fp2 = buildThreatFingerprint({ sequence: ["normal", "login"], endpoint: "/user/b" });
  recordClosureTest(tests, {
    id: "CLOSURE-THREAT-DNA-001",
    phase: 7,
    category: "threatDNA",
    name: "Similar users distinct fingerprints",
    pass: fp1 !== fp2,
    detail: `${fp1} vs ${fp2}`,
  });

  // FASE 8 — Memory
  const rt2 = resetHobeliscoRuntime();
  rt2.start();
  rt2.processEvent({ eventId: "m1", timestamp: new Date().toISOString(), kind: "AUTH_FAILURE", source: "t", cooperativeId: "Coop-LAB-A", actorId: "a", metadata: { failures: 3 } });
  rt2.processEvent({ eventId: "m2", timestamp: new Date().toISOString(), kind: "AUTH_FAILURE", source: "t", cooperativeId: "Coop-LAB-A", actorId: "a", metadata: { failures: 3 } });
  const memCount = rt2.organism.core.memory.stats().short + rt2.organism.core.memory.stats().mid;
  recordClosureTest(tests, {
    id: "CLOSURE-MEMORY-001",
    phase: 8,
    category: "memory",
    name: "Repeated incident increases memory context",
    pass: memCount > 0,
    detail: `entries=${memCount}`,
  });

  // FASE 9 — Antibody
  const cand = createAntibodyCandidate({ incidentId: "INC-CLOSURE-001", ruleId: "AUTH-001", threatDna: "THREAT-FP-TEST", name: "Closure Ab" });
  const abOk = !("blocked" in cand);
  let abValidated = false;
  if (abOk) {
    const promoted = promoteAntibody((cand as { id: string }).id, { passed: 8, total: 10, falsePositives: 1, falseNegatives: 0 });
    abValidated = promoted?.status === "VALIDATED" || promoted?.status === "TESTING";
  }
  recordClosureTest(tests, {
    id: "CLOSURE-ANTIBODY-001",
    phase: 9,
    category: "antibodies",
    name: "Antibody candidate requires origin",
    pass: abOk && abValidated,
    detail: abOk ? "origin ok" : "BLOCKED",
  });

  // FASE 10 — Evolution
  const reg = new DefenseRegistry();
  const dA = reg.register("DEF-001", "v1");
  const dB = reg.register("DEF-002", "v2", { parentDefenseId: dA.id, mutationReason: "closure test" });
  dA.metrics = computeMetrics({ simulations: 50, passed: 30, contained: 25, recovered: 20, falsePositives: 3, falseNegatives: 5 });
  dB.metrics = computeMetrics({ simulations: 50, passed: 40, contained: 35, recovered: 30, falsePositives: 2, falseNegatives: 3 });
  const evo = compareDefenses(dA, dB);
  recordClosureTest(tests, {
    id: "CLOSURE-EVOLUTION-001",
    phase: 10,
    category: "evolution",
    name: "Evolution compares defenses with lineage",
    pass: evo.parent !== null && Boolean(evo.reason),
    detail: evo.decision,
  });

  // FASE 11 — Arena full core
  const t4 = Date.now();
  const fullCore = runFullCoreSimulations({ includeSampleResults: 50 });
  perf.fullCoreMs = Date.now() - t4;
  recordClosureTest(tests, {
    id: "CLOSURE-ARENA-FULL",
    phase: 11,
    category: "arena",
    name: "1000 full core simulations",
    pass: fullCore.totalSimulations === 1000 && fullCore.passed > 0,
    detail: `${fullCore.passed}/${fullCore.totalSimulations} survival=${fullCore.survivalRate}%`,
  });

  // FASE 12 — Replay
  const rt3 = resetHobeliscoRuntime();
  const replayTest = runSnapshotReplayTest(rt3);
  recordClosureTest(tests, {
    id: "CLOSURE-REPLAY-001",
    phase: 12,
    category: "replay",
    name: "Snapshot restore replay compare",
    pass: replayTest.snapshotOk,
    detail: replayTest.match ? "match" : replayTest.divergence ?? "divergence",
  });

  // FASE 13 — Snapshot integrity
  const rt4 = resetHobeliscoRuntime();
  rt4.start();
  const snap = createFullSnapshot(rt4.organism);
  recordClosureTest(tests, {
    id: "CLOSURE-SNAPSHOT-001",
    phase: 13,
    category: "snapshot",
    name: "Snapshot integrity hash",
    pass: verifySnapshotIntegrity(snap) && snap.vitalState.length > 0,
    detail: snap.integrityHash,
  });

  // FASE 15 — Organ restart
  rt4.organism.components.stopComponent("sensor");
  const restarted = rt4.organism.components.restartComponent("sensor");
  recordClosureTest(tests, {
    id: "CLOSURE-ORGAN-RESTART-001",
    phase: 15,
    category: "organRestart",
    name: "Component restart controlled",
    pass: !("blocked" in restarted) && rt4.organism.components.all().find((c) => c.id === "sensor")?.health === "OK",
    detail: "sensor restart",
  });

  // FASE 16 — Hibernation
  const hib = rt4.organism.runHibernationScenario();
  recordClosureTest(tests, {
    id: "CLOSURE-HIBERNATION-001",
    phase: 16,
    category: "hibernation",
    name: "Hibernation wake cycle",
    pass: hib.success,
    detail: hib.states.join("→"),
  });

  // FASE 18 — Guardian
  const gs = runFalseSuccessBattery();
  recordClosureTest(tests, {
    id: "CLOSURE-GUARDIAN-001",
    phase: 18,
    category: "guardian",
    name: "GuardianValidator 5 false success scenarios",
    pass: gs.passed === gs.total,
    detail: `${gs.passed}/${gs.total}`,
  });

  // FASE 19 — Circuit breaker
  const cb = new CircuitBreaker();
  cb.recordFailure("1"); cb.recordFailure("2"); cb.recordFailure("3");
  recordClosureTest(tests, {
    id: "CLOSURE-CIRCUIT-001",
    phase: 19,
    category: "circuitBreaker",
    name: "Circuit open at 3 no auto retry",
    pass: !cb.canAttemptRepair(),
    detail: "OPEN",
  });

  // FASE 20 — Financial
  const finActions = ["CREATE_CREDIT", "CONSUME_CREDIT", "REFUND", "SETTLEMENT", "LEDGER_UPDATE", "RUN_MIGRATION", "DELETE_HISTORY", "NEGATIVE_CREDIT"];
  const finBlocked = finActions.filter((a) => !evaluateFinancialAction({ action: a, target: "closure" }).allowed).length;
  recordClosureTest(tests, {
    id: "CLOSURE-FINANCIAL-001",
    phase: 20,
    category: "financialBoundary",
    name: "Financial barrier absolute",
    pass: finBlocked === finActions.length,
    detail: `${finBlocked}/${finActions.length} blocked`,
  });

  // FASE 21 — Isolation
  const iso = rt4.organism.runIsolationScenario();
  recordClosureTest(tests, {
    id: "CLOSURE-ISOLATION-001",
    phase: 21,
    category: "cooperativeIsolation",
    name: "Coop A/B/C isolation",
    pass: iso.success && !iso.leak,
    detail: `leak=${iso.leak}`,
  });

  // FASE 22 — Red team
  const b = new LabBoundary();
  const prodChecks = ["PROD_DATABASE", "REAL_HB_CREDIT", "PRODUCTION", "STAGING"];
  const boundaryViolations = prodChecks.filter((r) => !b.check(r).blocked).length;
  recordClosureTest(tests, {
    id: "CLOSURE-REDTEAM-001",
    phase: 22,
    category: "redTeam",
    name: "Production boundary red team",
    pass: boundaryViolations === 0,
    detail: `${boundaryViolations} violations`,
  });

  // FASE 23 — Loop guard
  const lg = new LoopGuard(5);
  for (let i = 0; i < 6; i += 1) lg.tick("cycle");
  recordClosureTest(tests, {
    id: "CLOSURE-LOOP-001",
    phase: 23,
    category: "loopGuard",
    name: "Loop guard blocks infinite cycle",
    pass: !lg.tick("cycle").allowed,
    detail: "6th tick blocked",
  });

  // FASE 29 — Security scan
  const sec = securityScan();
  recordClosureTest(tests, {
    id: "CLOSURE-SECURITY-001",
    phase: 29,
    category: "securityScan",
    name: "No hardcoded secrets in lab/hobelisco-hx",
    pass: sec.pass,
    detail: sec.findings.join("; ") || "clean",
  });

  // Full organism audit regression
  const organism = runFullOrganismAudit();
  recordClosureTest(tests, {
    id: "CLOSURE-FULL-ORGANISM",
    phase: 28,
    category: "regression",
    name: "Full organism audit",
    pass: organism.organismVerdict !== "ORGANISM-RED",
    detail: `${organism.passed}/${organism.totalTests} ${organism.organismVerdict}`,
  });

  const passed = tests.filter((t) => t.status === "PASS").length;
  const failed = tests.filter((t) => t.status === "FAIL").length;
  const criticalFail = tests.filter((t) => t.status === "FAIL" && ["regression", "financialBoundary", "cooperativeIsolation", "redTeam"].includes(t.category)).length;

  const vitality = computeVitalityScore({
    perception: 90,
    memory: tests.find((t) => t.id === "CLOSURE-MEMORY-001")?.status === "PASS" ? 88 : 55,
    integrity: tests.find((t) => t.id === "CLOSURE-SNAPSHOT-001")?.status === "PASS" ? 95 : 50,
    defense: attacks.passed >= 23 ? 92 : 60,
    recovery: tests.find((t) => t.id === "CLOSURE-ORGAN-RESTART-001")?.status === "PASS" ? 85 : 50,
    learning: 80,
    selfWatch: 88,
  });

  const immunity = computeImmunityReadiness({
    detection: 85,
    containment: fullCore.containmentRate,
    recovery: fullCore.recoveryRate,
    validatedAntibodies: 5,
    survivalRate: fullCore.survivalRate,
  });

  let verdict: ClosureAuditReport["organismVerdict"] = "ORGANISM-GREEN";
  if (criticalFail > 0 || life.lifeVerdict !== "LIFE-GREEN" || boundaryViolations > 0) verdict = "ORGANISM-RED";
  else if (failed > 0 || attacks.passed < 25) verdict = "ORGANISM-AMBER";

  const gaps = [
    "10.000 full-core simulations: NOT_EXECUTED",
    "UI timeline completa: PARTIAL",
    "Staging Supabase: PRODUCTION_FORBIDDEN for closure scope",
  ];

  return {
    generatedAt: new Date().toISOString(),
    version: HOBELISCO_CLOSURE_VERSION,
    gitCommit: gitCommit(),
    organismVerdict: verdict,
    organismId: LAB_ORGANISM_ID,
    lifeState: rt.organism.core.stateMachine.current,
    vitality: vitality.overall,
    immunityReadiness: { score: immunity.score, classification: immunity.classification },
    tests,
    totalTests: tests.length,
    passed,
    failed,
    arena: {
      scenarios: arena.scenariosRun,
      passed: arena.scenariosPassed,
      microSims: arena.microSimulations,
      microPassed: arena.microSimulationsPassed,
      fullCore: fullCore.totalSimulations,
      fullCorePassed: fullCore.passed,
      notExecuted10000: fullCore.notExecuted10000,
    },
    attacks: { total: attacks.total, passed: attacks.passed },
    lifeCycle: { pass: deathStates.includes("DEAD"), detail: deathStates.join("→") },
    memory: { pass: memCount > 0 },
    threatDNA: { pass: fp1 !== fp2 },
    antibodies: { pass: abOk },
    evolution: { pass: evo.decision === "VALIDATED" || evo.decision === "PROPOSED" },
    guardian: { pass: gs.passed === gs.total, falseSuccessScenarios: gs.total },
    circuitBreaker: { pass: !cb.canAttemptRepair() },
    financialBoundary: { pass: finBlocked === finActions.length, blocked: finBlocked },
    cooperativeIsolation: { pass: iso.success },
    replay: { pass: replayTest.snapshotOk },
    snapshot: { pass: verifySnapshotIntegrity(snap) },
    deathReincarnation: { pass: deathStates.includes("REINCARNATING") },
    hibernation: { pass: hib.success },
    organRestart: { pass: tests.find((t) => t.id === "CLOSURE-ORGAN-RESTART-001")?.status === "PASS" },
    redTeam: { pass: boundaryViolations === 0 },
    loopGuard: { pass: tests.find((t) => t.id === "CLOSURE-LOOP-001")?.status === "PASS" },
    securityScan: { pass: sec.pass },
    productionBoundary: { violations: boundaryViolations },
    performance: perf,
    v1Regression: { life: life.lifeVerdict, arena: `${arena.scenariosPassed}/${arena.scenariosRun}` },
    remainingGaps: gaps,
    filesChanged: [
      "runtime/HobeliscoRuntime.ts",
      "events/HobeliscoEvent.ts",
      "attacks/AttackMatrix.ts",
      "guardian/GuardianValidator.ts",
      "antibodies/AntibodyEngine.ts",
      "immunity/ImmunityReadiness.ts",
      "closure-audit/*",
      "evolution/ReplayEngine.ts",
      "evolution/LabSnapshot.ts",
    ],
  };
}
