/** Replay Engine — record(), replay(), compare() */

import { resetHobeliscoCore } from "../core/HobeliscoCore";
import { resetLabClock, resetLabClock as resetClock } from "../lab-world/LabClock";
import { resetLabWorld } from "../lab-world/LabWorld";
import { resetOrganismIdentity } from "../organism/OrganismIdentity";
import { resetHobeliscoLabOrganism } from "../organism/HobeliscoLabOrganism";
import { HobeliscoRuntime, resetHobeliscoRuntime } from "../runtime/HobeliscoRuntime";
import type { HobeliscoEvent } from "../events/HobeliscoEvent";
import { createFullSnapshot, restoreFullSnapshot, type FullLabSnapshot } from "./LabSnapshot";
import { runFullCoreSimulations, type FullCoreSimulationReport } from "../arena/FullCoreSimulationRunner";

export interface RecordedIncident {
  recordId: string;
  seed: number;
  events: HobeliscoEvent[];
  initialState: string;
  finalState: string;
  health: number;
  contained: boolean;
  at: string;
}

export interface ReplayCompareResult {
  replayId: string;
  match: boolean;
  divergence?: "REPLAY-DIVERGENCE";
  original: { state: string; health: number };
  replayed: { state: string; health: number };
  notes: string[];
}

const records = new Map<string, RecordedIncident>();

export interface ReplayConfig {
  replayId: string;
  scenarioId?: string;
  seed: number;
  deterministicLab: boolean;
}

export interface ReplayResult {
  replayId: string;
  success: boolean;
  seed: number;
  eventSequence: string[];
  stateSequence: string[];
  defenseResult: string | null;
  metrics: { survivalRate: number; passed: number; total: number };
  notes: string[];
}

export function record(runtime: HobeliscoRuntime, events: HobeliscoEvent[], seed = 42): RecordedIncident {
  runtime.start();
  const initialState = runtime.organism.core.stateMachine.current;
  for (const e of events) runtime.processEvent(e);
  runtime.pulse();
  const rec: RecordedIncident = {
    recordId: `REC-${Date.now()}`,
    seed,
    events,
    initialState,
    finalState: runtime.organism.core.stateMachine.current,
    health: runtime.health(),
    contained: runtime.organism.core.stateMachine.current === "DEFENDING" || runtime.organism.core.stateMachine.current === "FORTRESS",
    at: new Date().toISOString(),
  };
  records.set(rec.recordId, rec);
  runtime.organism.core.audit.append("INCIDENT_RECORDED", { recordId: rec.recordId });
  return rec;
}

export function replay(config: ReplayConfig): ReplayResult {
  resetOrganismIdentity();
  resetLabWorld();
  resetLabClock();
  resetHobeliscoCore();

  const report = runFullCoreSimulations({
    maxPerScenario: 1,
    seed: config.seed,
    includeSampleResults: 1,
  });

  const sample = report.results[0];
  const runtime = resetHobeliscoRuntime();
  runtime.start();
  runtime.pulse();

  return {
    replayId: config.replayId,
    success: Boolean(sample?.passed),
    seed: config.seed,
    eventSequence: sample ? [sample.scenarioId] : [],
    stateSequence: sample?.stateTransitions ?? [runtime.organism.core.stateMachine.current],
    defenseResult: sample?.defense ?? null,
    metrics: {
      survivalRate: report.survivalRate,
      passed: report.passed,
      total: report.totalSimulations,
    },
    notes: [`Replay LAB-only — seed=${config.seed}`, `deterministic=${config.deterministicLab}`],
  };
}

export function replayRecorded(recordId: string): ReplayCompareResult | { error: string } {
  const rec = records.get(recordId);
  if (!rec) return { error: "RECORD_NOT_FOUND" };

  const runtime1 = resetHobeliscoRuntime();
  runtime1.start();
  for (const e of rec.events) runtime1.processEvent(e);
  runtime1.pulse();
  const original = { state: rec.finalState, health: rec.health };

  resetOrganismIdentity();
  resetLabWorld();
  resetClock(1_700_000_000_000);
  const runtime2 = resetHobeliscoRuntime();
  runtime2.start();
  for (const e of rec.events) runtime2.processEvent(e);
  runtime2.pulse();
  const replayed = { state: runtime2.organism.core.stateMachine.current, health: runtime2.health() };

  const match = original.state === replayed.state && Math.abs(original.health - replayed.health) <= 5;
  return {
    replayId: recordId,
    match,
    divergence: match ? undefined : "REPLAY-DIVERGENCE",
    original,
    replayed,
    notes: match ? ["states equivalent"] : ["REPLAY-DIVERGENCE detected"],
  };
}

export function compareSnapshots(a: FullLabSnapshot, b: FullLabSnapshot): { match: boolean; diffs: string[] } {
  const diffs: string[] = [];
  if (a.vitalState !== b.vitalState) diffs.push(`state: ${a.vitalState} vs ${b.vitalState}`);
  if (a.dna !== b.dna) diffs.push(`dna: ${a.dna} vs ${b.dna}`);
  if (Math.abs(a.health - b.health) > 5) diffs.push(`health: ${a.health} vs ${b.health}`);
  return { match: diffs.length === 0, diffs };
}

export function runSnapshotReplayTest(runtime: HobeliscoRuntime): ReplayCompareResult & { snapshotOk: boolean } {
  runtime.start();
  const snap = createFullSnapshot(runtime.organism);
  const event: HobeliscoEvent = {
    eventId: "EVT-REPLAY-TEST",
    timestamp: new Date().toISOString(),
    kind: "AUTH_FAILURE",
    source: "test",
    cooperativeId: "Coop-LAB-A",
    actorId: "Actor-LAB-Attacker-001",
    metadata: { failures: 5 },
  };
  runtime.processEvent(event);
  runtime.pulse();
  const afterIncident = { state: runtime.organism.core.stateMachine.current, health: runtime.health() };

  restoreFullSnapshot(runtime.organism, snap);
  for (const e of [event]) runtime.processEvent(e);
  runtime.pulse();
  const afterReplay = { state: runtime.organism.core.stateMachine.current, health: runtime.health() };

  const match = afterIncident.state === afterReplay.state;
  return {
    replayId: snap.id,
    match,
    divergence: match ? undefined : "REPLAY-DIVERGENCE",
    original: afterIncident,
    replayed: afterReplay,
    notes: match ? ["snapshot replay equivalent"] : ["REPLAY-DIVERGENCE"],
    snapshotOk: snap.integrityHash.length === 16,
  };
}

export function getArenaFullReport(seed = 42): FullCoreSimulationReport {
  return runFullCoreSimulations({ seed, includeSampleResults: 100 });
}

export { runFullCoreSimulations };
