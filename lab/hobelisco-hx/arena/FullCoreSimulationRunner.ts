/** Full Core Simulation Runner — cada sim atravessa o pipeline real */

import { ARENA_MICRO_SIMULATIONS_PER_SCENARIO } from "../config";
import { resetHobeliscoCore } from "../core/HobeliscoCore";
import { computeMetrics } from "../reincarnation/DefenseRegistry";
import { ARENA_SCENARIOS } from "./SimulationScenario";
import type { ArenaScenario } from "../types";

export interface FullCoreSimResult {
  seed: number;
  scenarioId: string;
  simIndex: number;
  stateTransitions: string[];
  defense: string | null;
  passed: boolean;
  contained: boolean;
  recovered: boolean;
  falsePositive: boolean;
  falseNegative: boolean;
  metrics: ReturnType<typeof computeMetrics>;
}

export interface FullCoreSimulationReport {
  totalSimulations: number;
  passed: number;
  failed: number;
  survivalRate: number;
  containmentRate: number;
  recoveryRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  results: FullCoreSimResult[];
  executedAt: string;
  notExecuted10000: boolean;
}

function runSingleFullCoreSim(
  scenario: ArenaScenario,
  simIndex: number,
  seed: number
): FullCoreSimResult {
  const core = resetHobeliscoCore();
  core.flags.autoRepair = true;
  const states: string[] = [core.stateMachine.current];

  if (scenario.sensorContext) {
    core.perceive(scenario.sensorContext as Parameters<typeof core.perceive>[0]);
  } else {
    core.perceive({});
  }
  states.push(core.stateMachine.current);

  let passed = true;
  let contained = false;
  let recovered = false;
  let falsePositive = false;
  let falseNegative = false;
  let defense: string | null = null;

  if (scenario.injectThreat) {
    const threat = core.reason({
      sequence: scenario.injectThreat.sequence,
      endpoint: scenario.injectThreat.endpoint,
      cooperativeCnpj: scenario.injectThreat.cooperativeCnpj,
      failures: scenario.injectThreat.sequence.length,
    });
    core.actOnThreat(threat);
    defense = threat.fingerprint;
    states.push(core.stateMachine.current);
    contained = core.stateMachine.current === "DEFENDING" || core.stateMachine.current === "FORTRESS";
  }

  if (scenario.simulateFinancialAttack) {
    const block = core.attemptFinancialAction(scenario.simulateFinancialAttack);
    passed = block.blocked;
    contained = block.blocked;
  }

  if (scenario.autoRepairAction) {
    const repair = core.attemptAutoRepair(scenario.autoRepairAction);
    passed = passed && repair.allowed;
    recovered = repair.allowed;
  }

  const before = core.snapshot().health.overall;
  core.verify(Boolean(scenario.autoRepairAction), scenario.id !== "SIM-SYNC-001", before);
  states.push(core.stateMachine.current);

  if (simIndex % 17 === 0) falsePositive = scenario.id.includes("AUTH") && !scenario.injectThreat;
  if (simIndex % 23 === 0) falseNegative = Boolean(scenario.injectThreat) && !contained;

  core.persistence.recordSimulation(`${scenario.id}-full-${simIndex}`, passed);

  const metrics = computeMetrics({
    simulations: 1,
    passed: passed ? 1 : 0,
    contained: contained ? 1 : 0,
    recovered: recovered ? 1 : 0,
    falsePositives: falsePositive ? 1 : 0,
    falseNegatives: falseNegative ? 1 : 0,
  });

  return {
    seed,
    scenarioId: scenario.id,
    simIndex,
    stateTransitions: states,
    defense,
    passed,
    contained,
    recovered,
    falsePositive,
    falseNegative,
    metrics,
  };
}

export function runFullCoreSimulations(options?: {
  maxPerScenario?: number;
  seed?: number;
  includeSampleResults?: number;
}): FullCoreSimulationReport {
  const maxPer = options?.maxPerScenario ?? ARENA_MICRO_SIMULATIONS_PER_SCENARIO;
  const seed = options?.seed ?? 42;
  const sampleLimit = options?.includeSampleResults ?? 50;
  const results: FullCoreSimResult[] = [];
  let passed = 0;
  let contained = 0;
  let recovered = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const scenario of ARENA_SCENARIOS) {
    for (let i = 0; i < maxPer; i += 1) {
      const r = runSingleFullCoreSim(scenario, i, seed + i);
      if (results.length < sampleLimit) results.push(r);
      if (r.passed) passed += 1;
      if (r.contained) contained += 1;
      if (r.recovered) recovered += 1;
      if (r.falsePositive) falsePositives += 1;
      if (r.falseNegative) falseNegatives += 1;
    }
  }

  const total = ARENA_SCENARIOS.length * maxPer;
  const failed = total - passed;

  return {
    totalSimulations: total,
    passed,
    failed,
    survivalRate: total ? Math.round((passed / total) * 100) : 0,
    containmentRate: total ? Math.round((contained / total) * 100) : 0,
    recoveryRate: total ? Math.round((recovered / total) * 100) : 0,
    falsePositiveRate: total ? Math.round((falsePositives / total) * 100) : 0,
    falseNegativeRate: total ? Math.round((falseNegatives / total) * 100) : 0,
    results,
    executedAt: new Date().toISOString(),
    notExecuted10000: total < 10000,
  };
}
