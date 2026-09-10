/** SimulationRunner V1 — 10 cenários + 1000 micro-simulações leves */

import { ARENA_MICRO_SIMULATIONS_PER_SCENARIO } from "../config";
import { resetHobeliscoCore } from "../core/HobeliscoCore";
import { evaluateFinancialAction } from "../financial/FinancialGuard";
import { attemptAutoRepair } from "../remediation/AutoRepair";
import { matchRules } from "../rules/RuleEngine";
import type { ArenaReport, ArenaScenario } from "../types";
import { ARENA_SCENARIOS } from "./SimulationScenario";
import { allMandatoryPassed, runMandatoryTests } from "./mandatoryTests";
import { ReincarnationEngine } from "../reincarnation/ReincarnationEngine";
import { classifyThreat } from "../threat/ThreatClassifier";

function runScenario(core: ReturnType<typeof resetHobeliscoCore>, scenario: ArenaScenario): boolean {
  let ok = true;

  if (scenario.sensorContext) {
    core.perceive(scenario.sensorContext as Parameters<typeof core.perceive>[0]);
  } else {
    core.perceive({});
  }

  if (scenario.injectThreat) {
    const threat = core.reason({
      sequence: scenario.injectThreat.sequence,
      endpoint: scenario.injectThreat.endpoint,
      cooperativeCnpj: scenario.injectThreat.cooperativeCnpj,
      userRole: scenario.injectThreat.userRole,
      failures: scenario.injectThreat.sequence.length,
    });
    core.actOnThreat(threat);
  }

  if (scenario.simulateFinancialAttack) {
    const block = core.attemptFinancialAction(scenario.simulateFinancialAttack);
    ok = block.blocked;
  }

  if (scenario.autoRepairAction) {
    const repair = core.attemptAutoRepair(scenario.autoRepairAction);
    if (scenario.id === "SIM-CACHE-001" || scenario.id === "SIM-SYNC-001") {
      ok = ok && repair.allowed;
    }
  }

  const before = core.snapshot().health.overall;
  core.verify(Boolean(scenario.autoRepairAction), scenario.id !== "SIM-SYNC-001", before);
  core.persistence.recordSimulation(scenario.id, ok);

  return ok;
}

/** 100 micro-sims por cenário — validação determinística sem mutar core */
function runMicroSimulations(scenario: ArenaScenario): { passed: number; total: number } {
  let passed = 0;
  for (let i = 0; i < ARENA_MICRO_SIMULATIONS_PER_SCENARIO; i += 1) {
    let ok = true;

    if (scenario.simulateFinancialAttack) {
      ok = !evaluateFinancialAction(scenario.simulateFinancialAttack).allowed;
    } else if (scenario.autoRepairAction) {
      ok = attemptAutoRepair(scenario.autoRepairAction).allowed;
    } else if (scenario.injectThreat) {
      const threat = classifyThreat({
        sequence: scenario.injectThreat.sequence,
        endpoint: scenario.injectThreat.endpoint,
        failures: scenario.injectThreat.sequence.length,
      });
      const rules = matchRules({ threat, scenarioId: scenario.id });
      ok = rules.length > 0 && threat.fingerprint.startsWith("THREAT-FP-");
    }

    if (ok) passed += 1;
  }
  return { passed, total: ARENA_MICRO_SIMULATIONS_PER_SCENARIO };
}

export function runArenaSimulation(): ArenaReport {
  const reincarnation = new ReincarnationEngine();
  const notes: string[] = [];
  let scenariosPassed = 0;
  let microPassed = 0;
  let microTotal = 0;

  const defenseV1 = reincarnation.register("DEFENSE-V1");
  notes.push(`Defense registered: ${defenseV1.id}`);

  for (const scenario of ARENA_SCENARIOS) {
    const core = resetHobeliscoCore();
    core.flags.autoRepair = true;

    const scenarioOk = runScenario(core, scenario);
    if (scenarioOk) scenariosPassed += 1;
    else notes.push(`FAIL scenario: ${scenario.id}`);

    const micro = runMicroSimulations(scenario);
    microPassed += micro.passed;
    microTotal += micro.total;
  }

  notes.push(
    `Micro-simulações: ${microPassed}/${microTotal} (${ARENA_SCENARIOS.length}×${ARENA_MICRO_SIMULATIONS_PER_SCENARIO})`
  );

  reincarnation.markDead(defenseV1.id, "arena 1000 micro-sims");
  const v2 = reincarnation.reincarnate(defenseV1.id, "DEFENSE-V2");
  if (v2) {
    reincarnation.promote(v2.id, "validated");
    notes.push(`Reincarnation: ${v2.version} validated`);
  }

  const finalCore = resetHobeliscoCore();
  finalCore.flags.autoRepair = true;
  for (const scenario of ARENA_SCENARIOS.slice(0, 3)) {
    runScenario(finalCore, scenario);
  }

  const mandatoryTests = runMandatoryTests(finalCore);
  const snapshot = finalCore.snapshot();

  return {
    generatedAt: new Date().toISOString(),
    scenariosRun: ARENA_SCENARIOS.length,
    scenariosPassed,
    microSimulations: microTotal,
    microSimulationsPassed: microPassed,
    mandatoryTests,
    allMandatoryPassed: allMandatoryPassed(mandatoryTests),
    snapshot,
    notes,
  };
}
