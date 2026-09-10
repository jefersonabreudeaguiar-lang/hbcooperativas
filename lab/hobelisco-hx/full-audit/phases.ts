/**
 * Full Organism Audit — suíte HOBELISCO-LAB-*
 */

import { runFullCoreSimulations } from "../arena/FullCoreSimulationRunner";
import { runArenaSimulation } from "../arena/SimulationRunner";
import { HOBELISCO_LAB_ORGANISM_VERSION, LAB_ORGANISM_ID } from "../config";
import { evaluateFinancialAction } from "../financial/FinancialGuard";
import { compareDefenses } from "../evolution/EvolutionEngine";
import { replay } from "../evolution/ReplayEngine";
import { createFullSnapshot, restoreFullSnapshot, clearSnapshots } from "../evolution/LabSnapshot";
import { runLifeAudit } from "../life-audit/runLifeAudit";
import { LabBoundary } from "../lab-world/LabBoundary";
import { resetLabClock, advanceTime, nowIso } from "../lab-world/LabClock";
import { resetHobeliscoLabOrganism } from "../organism/HobeliscoLabOrganism";
import { initOrganismIdentity, getOrganismIdentity } from "../organism/OrganismIdentity";
import { runHobeliscoBootSequence } from "../organism/HobeliscoBootSequence";
import { runHobeliscoPulse } from "../organism/HobeliscoPulse";
import { ComponentLifecycleManager } from "../organism/ComponentLifecycleManager";
import { computeMetrics, DefenseRegistry } from "../reincarnation/DefenseRegistry";
import { CircuitBreaker } from "../validation/CircuitBreaker";
import { LoopGuard } from "../validation/LoopGuard";
import { registerAntibody } from "../antibodies/AntibodyRegistry";
import { recordOrganismTest } from "./types";
import type { OrganismTestResult } from "./types";

export function runFullOrganismPhases(tests: OrganismTestResult[]): {
  fullCore: ReturnType<typeof runFullCoreSimulations>;
  arena: ReturnType<typeof runArenaSimulation>;
  life: ReturnType<typeof runLifeAudit>;
} {
  process.env.HOBELISCO_ENVIRONMENT = "LAB";

  // BOOT
  {
    const org = resetHobeliscoLabOrganism();
    initOrganismIdentity();
    const boot = runHobeliscoBootSequence(org.core);
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-BOOT-001",
      name: "Boot sequence with BootReport",
      severity: "critical",
      pass: boot.checks.length >= 8 && typeof boot.success === "boolean",
      detail: `checks=${boot.checks.length} success=${boot.success}`,
    });
  }

  // PULSE
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    const p1 = runHobeliscoPulse(org.core, 1);
    const p2 = runHobeliscoPulse(org.core, 2);
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-PULSE-001",
      name: "Pulse produces pulseId and dimensions",
      severity: "critical",
      pass: p1.pulseId.startsWith("PULSE-") && p2.health >= 0 && p1.timestamp.length > 0,
      detail: `${p1.pulseId} health=${p1.health}`,
    });
  }

  // SENSORS via LabWorld
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    org.processLabEvent("auth-burst");
    const snap = org.core.snapshot();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-SENSORS-001",
      name: "Lab events feed sensors",
      severity: "high",
      pass: snap.sensors.length >= 10,
      detail: `${snap.sensors.length} sensors`,
    });
  }

  // MEMORY
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    org.processLabEvent("auth-burst");
    org.processLabEvent("auth-burst");
    const known = org.core.memory.all().some((m) => m.kind === "threat" || m.kind === "boot");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-MEMORY-001",
      name: "Memory recalls incidents",
      severity: "high",
      pass: known && org.core.memory.stats().short + org.core.memory.stats().mid > 0,
      detail: `mem short=${org.core.memory.stats().short}`,
    });
  }

  // THREAT
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    const t = org.core.reason({ sequence: ["a", "b", "c"], endpoint: "/x", failures: 3 });
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-THREAT-001",
      name: "Threat DNA fingerprint",
      severity: "high",
      pass: t.fingerprint.startsWith("THREAT-FP-"),
      detail: t.fingerprint,
    });
  }

  // RISK
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    org.processLabEvent("behavior-anomaly");
    const snap = org.core.snapshot();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-RISK-001",
      name: "Risk engine classifies",
      severity: "high",
      pass: Boolean(snap.riskLevel),
      detail: snap.riskLevel,
    });
  }

  // DEFENSE
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    const t = org.core.reason({ sequence: ["x"], endpoint: "/y", failures: 5 });
    org.core.actOnThreat(t);
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-DEFENSE-001",
      name: "Defense flow on threat",
      severity: "critical",
      pass: org.core.immune.recent.length > 0,
      detail: `immune actions=${org.core.immune.recent.length}`,
    });
  }

  // GUARDIAN
  {
    const org = resetHobeliscoLabOrganism();
    const g = org.runGuardianFalseSuccessScenario();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-GUARDIAN-001",
      name: "Guardian FALSE_SUCCESS",
      severity: "critical",
      pass: g.falseSuccess,
      detail: `safeMode=${g.safeMode}`,
    });
  }

  // CIRCUIT
  {
    const cb = new CircuitBreaker();
    cb.recordFailure("1");
    cb.recordFailure("2");
    const s3 = cb.recordFailure("3");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-CIRCUIT-001",
      name: "Circuit opens at 3 failures",
      severity: "critical",
      pass: s3.open && !cb.canAttemptRepair(),
      detail: `open=${s3.open}`,
    });
  }

  // FORTRESS
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    org.core.flags.fortress = true;
    org.pulse();
    const snap = org.core.snapshot();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-FORTRESS-001",
      name: "Fortress mode active",
      severity: "high",
      pass: snap.fortressLevel === "FORTRESS" || snap.fortressLevel === "DEFENSIVE",
      detail: snap.fortressLevel,
    });
  }

  // HIBERNATION
  {
    const org = resetHobeliscoLabOrganism();
    const r = org.runHibernationScenario();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-HIBERNATION-001",
      name: "Hibernation cycle",
      severity: "high",
      pass: r.success,
      detail: r.states.join("→"),
    });
  }

  // ORGAN DEATH
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    org.components.stopComponent("memory");
    const dead = org.components.all().find((c) => c.id === "memory")?.health === "DEAD";
    org.components.stopComponent("sensor");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-ORGAN-DEATH-001",
      name: "Component death detection",
      severity: "high",
      pass: dead,
      detail: "memory OFF → DEAD",
    });
    org.components.restartComponent("memory");
  }

  // REINCARNATION
  {
    const org = resetHobeliscoLabOrganism();
    const d1 = org.reincarnation.register("DEFENSE-001");
    org.reincarnation.markDead(d1.id, "test");
    const d2 = org.reincarnation.reincarnate(d1.id, "DEFENSE-002");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-REINCARNATION-001",
      name: "Reincarnation preserves lineage",
      severity: "critical",
      pass: Boolean(d2 && d2.notes.some((n) => n.includes("reincarnated"))),
      detail: d2?.id ?? "none",
    });
  }

  // DNA
  {
    const org = resetHobeliscoLabOrganism();
    initOrganismIdentity();
    const id = getOrganismIdentity();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-DNA-001",
      name: "Stable organismId and DNA",
      severity: "critical",
      pass: id.organismId === LAB_ORGANISM_ID && id.dnaId.startsWith("DNA-"),
      detail: `${id.organismId} ${id.dnaId}`,
    });
  }

  // ANTIBODY
  {
    const ab = registerAntibody("INCIDENT-LAB-001", "Test Antibody", "RULE-AUTH-001");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-ANTIBODY-001",
      name: "Antibody requires origin",
      severity: "high",
      pass: ab.bornFrom.startsWith("INCIDENT"),
      detail: ab.id,
    });
  }

  // LEARNING
  {
    const org = resetHobeliscoLabOrganism();
    org.boot();
    org.processLabEvent("sync-failure");
    const insights = org.core.snapshot().learningInsights;
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-LEARNING-001",
      name: "Learning insights from memory",
      severity: "medium",
      pass: Array.isArray(insights),
      detail: `${insights.length} insights`,
    });
  }

  // FINANCIAL
  {
    const actions = ["CREATE_CREDIT", "CONSUME_CREDIT", "REFUND", "SETTLEMENT", "LEDGER_UPDATE", "RUN_MIGRATION"];
    const blocked = actions.every((a) => !evaluateFinancialAction({ action: a, target: "lab" }).allowed);
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-FINANCIAL-001",
      name: "Financial boundary absolute",
      severity: "critical",
      pass: blocked,
      detail: `${actions.length} blocked`,
    });
  }

  // ISOLATION
  {
    const org = resetHobeliscoLabOrganism();
    const iso = org.runIsolationScenario();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-ISOLATION-001",
      name: "Cooperative isolation",
      severity: "critical",
      pass: iso.success && !iso.leak,
      detail: `leak=${iso.leak}`,
    });
  }

  // LOOP
  {
    const lg = new LoopGuard(3);
    lg.tick("a");
    lg.tick("a");
    lg.tick("a");
    const blocked = !lg.tick("a").allowed;
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-LOOP-001",
      name: "Loop guard blocks excess",
      severity: "high",
      pass: blocked,
      detail: "4th tick blocked",
    });
  }

  // REPLAY
  {
    const r = replay({ replayId: "REPLAY-001", seed: 42, deterministicLab: true });
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-REPLAY-001",
      name: "Replay engine",
      severity: "medium",
      pass: r.replayId === "REPLAY-001" && r.stateSequence.length > 0,
      detail: r.notes.join("; "),
    });
  }

  // SNAPSHOT
  {
    clearSnapshots();
    const org = resetHobeliscoLabOrganism();
    org.boot();
    const snap = createFullSnapshot(org);
    const ok = restoreFullSnapshot(org, snap);
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-SNAPSHOT-001",
      name: "Snapshot and restore",
      severity: "medium",
      pass: ok && snap.id.startsWith("SNAP-"),
      detail: snap.id,
    });
  }

  // RED TEAM
  {
    const org = resetHobeliscoLabOrganism();
    const prod = org.attemptProductionAccess();
    const fin = org.core.attemptFinancialAction({ action: "CREATE_CREDIT", target: "redteam" });
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-REDTEAM-001",
      name: "Self-attack boundary tests",
      severity: "critical",
      pass: prod.blocked && fin.blocked,
      detail: prod.reason,
    });
  }

  // PRODUCTION BLOCK
  {
    const b = new LabBoundary();
    const r = b.check("PROD_DATABASE");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-PRODUCTION-BLOCK-001",
      name: "Production access blocked",
      severity: "critical",
      pass: r.blocked && r.reason === "BLOCKED_BY_LAB_BOUNDARY",
      detail: r.blocked ? "BLOCKED" : "FAIL",
    });
  }

  // REAL DATABASE BLOCK
  {
    const b = new LabBoundary();
    const r = b.check("REAL_DATABASE");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-REAL-DATABASE-BLOCK-001",
      name: "Real database blocked",
      severity: "critical",
      pass: r.blocked,
      detail: "REAL_DATABASE",
    });
  }

  // REAL CREDIT BLOCK
  {
    const b = new LabBoundary();
    const r = b.check("REAL_HB_CREDIT");
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-REAL-CREDIT-BLOCK-001",
      name: "Real HB credit blocked",
      severity: "critical",
      pass: r.blocked,
      detail: "REAL_HB_CREDIT",
    });
  }

  // FULL CYCLE
  {
    const org = resetHobeliscoLabOrganism();
    const r = org.runFullLifeCycle();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-FULL-CYCLE-001",
      name: "Full life cycle scenario",
      severity: "critical",
      pass: r.success,
      detail: r.states.join("→"),
    });
  }

  // DETERMINISM
  {
    const FIXED = 1_700_000_000_000;
    resetLabClock(FIXED);
    advanceTime(1000);
    const t1 = nowIso();
    resetLabClock(FIXED);
    advanceTime(1000);
    const t2 = nowIso();
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-SEED-001",
      name: "Deterministic lab clock",
      severity: "medium",
      pass: t1 === t2,
      detail: `${t1}`,
    });
  }

  // SECRET SCAN (basic)
  {
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-SECRET-SCAN-001",
      name: "No hardcoded secrets in config",
      severity: "high",
      pass: !LAB_ORGANISM_ID.includes("Bearer") && !HOBELISCO_LAB_ORGANISM_VERSION.includes("sk-"),
      detail: "pattern scan config constants",
    });
  }

  const life = runLifeAudit();
  const arena = runArenaSimulation();
  const fullCore = runFullCoreSimulations({ includeSampleResults: 20 });

  recordOrganismTest(tests, {
    id: "HOBELISCO-LAB-V1-REGRESSION",
    name: "V1 Life Audit regression",
    severity: "critical",
    pass: life.lifeVerdict === "LIFE-GREEN" && life.failed === 0,
    detail: `${life.passed}/${life.totalTests}`,
  });

  recordOrganismTest(tests, {
    id: "HOBELISCO-LAB-ARENA-REGRESSION",
    name: "V1 Arena regression",
    severity: "critical",
    pass: arena.scenariosPassed === arena.scenariosRun && arena.allMandatoryPassed,
    detail: `${arena.scenariosPassed}/${arena.scenariosRun}`,
  });

  // Evolution
  {
    const reg = new DefenseRegistry();
    const a = reg.register("DEFENSE-001", "v1");
    const b = reg.register("DEFENSE-002", "v2", { parentDefenseId: a.id });
    a.metrics = computeMetrics({ simulations: 100, passed: 70, contained: 60, recovered: 50, falsePositives: 5, falseNegatives: 10 });
    b.metrics = computeMetrics({ simulations: 100, passed: 85, contained: 75, recovered: 65, falsePositives: 3, falseNegatives: 5 });
    const evo = compareDefenses(a, b);
    recordOrganismTest(tests, {
      id: "HOBELISCO-LAB-EVOLUTION-001",
      name: "Evolution compares defenses",
      severity: "medium",
      pass: evo.decision === "VALIDATED" || evo.decision === "PROPOSED",
      detail: evo.reason,
    });
  }

  return { fullCore, arena, life };
}
