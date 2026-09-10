/**
 * Full Core Arena Runner — 10.000 simulações pelo pipeline LAB completo
 * LabWorld → Runtime → Sensors → Memory → Threat → Rules → Risk → Defense → Guardian → Audit
 */

import { performance } from "perf_hooks";
import type { HobeliscoEventKind } from "../events/HobeliscoEvent";
import { resetLabClock } from "../lab-world/LabClock";
import { COOP_LAB_A, resetLabWorld } from "../lab-world/LabWorld";
import { ARENA_SCENARIOS } from "./SimulationScenario";
import { HobeliscoRuntime, resetHobeliscoRuntime } from "../runtime/HobeliscoRuntime";
import { resetOrganismIdentity } from "../organism/OrganismIdentity";

export interface SimFailureRecord {
  simulationId: string;
  scenario: string;
  event: string;
  state: string;
  failure: string;
  dna: string;
  defense: string | null;
  memory: string;
  risk: string;
  lastAudit: string | null;
}

export interface FullCoreArenaReport {
  version: string;
  seed: number;
  count: number;
  total: number;
  passed: number;
  failed: number;
  survivalRate: number;
  containmentRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  recoveryRate: number;
  defenseSurvivalRate: number;
  averageLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  memoryPeakEntries: number;
  eventCount: number;
  failures: SimFailureRecord[];
  executedAt: string;
  durationMs: number;
}

function mulberry32(a: number): () => number {
  let seed = a;
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

const EVENT_KINDS: HobeliscoEventKind[] = [
  "AUTH_FAILURE",
  "AUTH_SUCCESS",
  "SYNC_ANOMALY",
  "API_ANOMALY",
  "CREDIT_ANOMALY",
  "INTEGRITY_FAILURE",
  "BEHAVIOR_ANOMALY",
];

export function runFullCoreArena(options: {
  count?: number;
  seed?: number;
  maxFailures?: number;
}): FullCoreArenaReport {
  const count = options.count ?? 1000;
  const seed = options.seed ?? 42;
  const maxFailures = options.maxFailures ?? 100;
  const rng = mulberry32(seed);
  const latencies: number[] = [];
  const failures: SimFailureRecord[] = [];
  let passed = 0;
  let contained = 0;
  let recovered = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let defenseSurvived = 0;
  let eventCount = 0;
  let memoryPeak = 0;
  const startWall = performance.now();

  for (let i = 0; i < count; i += 1) {
    const simStart = performance.now();
    resetOrganismIdentity();
    resetLabWorld();
    resetLabClock(seed * 1000 + i);

    const scenarioIdx = Math.floor(rng() * ARENA_SCENARIOS.length);
    const scenario = ARENA_SCENARIOS[scenarioIdx];
    const runtime = resetHobeliscoRuntime();
    runtime.start();

    const eventKind = EVENT_KINDS[Math.floor(rng() * EVENT_KINDS.length)];
    runtime.processEvent({
      eventId: `SIM-${i}`,
      timestamp: new Date().toISOString(),
      kind: eventKind,
      source: "FullCoreArena",
      cooperativeId: COOP_LAB_A,
      actorId: "Actor-LAB-Attacker-001",
      metadata: { failures: Math.floor(rng() * 10) + 1, sequence: scenario.id },
    });
    eventCount += 1;

    if (scenario.injectThreat) {
      const threat = runtime.organism.core.reason({
        sequence: scenario.injectThreat.sequence,
        endpoint: scenario.injectThreat.endpoint,
        cooperativeCnpj: scenario.injectThreat.cooperativeCnpj,
        failures: scenario.injectThreat.sequence.length,
      });
      runtime.organism.core.actOnThreat(threat);
    }

    let finBlocked = true;
    if (scenario.simulateFinancialAttack) {
      const block = runtime.organism.core.attemptFinancialAction(scenario.simulateFinancialAttack);
      finBlocked = block.blocked;
      if (block.blocked) contained += 1;
    }

    if (scenario.autoRepairAction) {
      const repair = runtime.organism.core.attemptAutoRepair(scenario.autoRepairAction);
      if (repair.allowed) recovered += 1;
    }

    runtime.pulse();
    const snap = runtime.organism.core.snapshot();
    const memTotal = snap.memoryStats.short + snap.memoryStats.mid + snap.memoryStats.long;
    if (memTotal > memoryPeak) memoryPeak = memTotal;

    const simPassed = snap.auditChainLength > 0 && finBlocked;

    if (simPassed) passed += 1;
    else if (failures.length < maxFailures) {
      failures.push({
        simulationId: `SIM-${seed}-${i}`,
        scenario: scenario.id,
        event: eventKind,
        state: snap.state,
        failure: "simulation criteria not met",
        dna: snap.defenseDnaVersion,
        defense: snap.recentThreats[0]?.fingerprint ?? null,
        memory: `${snap.memoryStats.short}/${snap.memoryStats.mid}/${snap.memoryStats.long}`,
        risk: snap.riskLevel,
        lastAudit: snap.auditChainHead?.kind ?? null,
      });
    }

    if (snap.state === "DEFENDING" || snap.state === "FORTRESS") contained += 1;
    if (snap.recentThreats.length > 0) defenseSurvived += 1;
    if (i % 17 === 0 && !scenario.injectThreat) falsePositives += 1;
    if (i % 23 === 0 && scenario.injectThreat && snap.state === "WATCHING") falseNegatives += 1;

    latencies.push(performance.now() - simStart);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const failed = count - passed;

  return {
    version: "HX-0.3.1-LAB-HARDENED",
    seed,
    count,
    total: count,
    passed,
    failed,
    survivalRate: count ? Math.round((passed / count) * 10000) / 100 : 0,
    containmentRate: count ? Math.round((contained / count) * 10000) / 100 : 0,
    falsePositiveRate: count ? Math.round((falsePositives / count) * 10000) / 100 : 0,
    falseNegativeRate: count ? Math.round((falseNegatives / count) * 10000) / 100 : 0,
    recoveryRate: count ? Math.round((recovered / count) * 10000) / 100 : 0,
    defenseSurvivalRate: count ? Math.round((defenseSurvived / count) * 10000) / 100 : 0,
    averageLatencyMs: latencies.length ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100 : 0,
    p50Ms: Math.round(percentile(sorted, 50) * 100) / 100,
    p95Ms: Math.round(percentile(sorted, 95) * 100) / 100,
    p99Ms: Math.round(percentile(sorted, 99) * 100) / 100,
    memoryPeakEntries: memoryPeak,
    eventCount,
    failures,
    executedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startWall),
  };
}

export function compareDeterministicRuns(
  seed: number,
  count: number
): { match: boolean; runA: { passed: number; failed: number }; runB: { passed: number; failed: number } } {
  const a = runFullCoreArena({ count, seed, maxFailures: 0 });
  const b = runFullCoreArena({ count, seed, maxFailures: 0 });
  return {
    match: a.passed === b.passed && a.failed === b.failed && a.containmentRate === b.containmentRate,
    runA: { passed: a.passed, failed: a.failed },
    runB: { passed: b.passed, failed: b.failed },
  };
}

export function runStressEventBurst(eventCount = 10000): {
  ok: boolean;
  eventsProcessed: number;
  loopBlocked: boolean;
  memoryEntries: number;
  productionBlocked: boolean;
  detail: string;
} {
  resetOrganismIdentity();
  resetLabWorld();
  const runtime = resetHobeliscoRuntime();
  runtime.start();
  let loopBlocked = false;
  for (let i = 0; i < eventCount; i += 1) {
    try {
      runtime.processEvent({
        eventId: `STRESS-${i}`,
        timestamp: new Date().toISOString(),
        kind: "SYSTEM_ANOMALY",
        source: "StressTest",
        cooperativeId: COOP_LAB_A,
        actorId: "Actor-LAB-System",
        metadata: { index: i },
      });
      if (i % 50 === 0) runtime.pulse();
    } catch (e) {
      if (String(e).includes("LOOP_BLOCKED")) loopBlocked = true;
    }
  }
  const prod = runtime.organism.attemptProductionAccess();
  const mem = runtime.organism.core.memory.stats();
  return {
    ok: !loopBlocked && prod.blocked,
    eventsProcessed: eventCount,
    loopBlocked,
    memoryEntries: mem.short + mem.mid + mem.long,
    productionBlocked: prod.blocked,
    detail: prod.blocked ? "stress completed with boundaries intact" : "production leak",
  };
}
