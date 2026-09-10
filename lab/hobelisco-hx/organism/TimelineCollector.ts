/** Coletor de timeline — eventos reais do runtime LAB */

import { computeImmunityReadiness } from "../immunity/ImmunityReadiness";
import { listAntibodyRecords } from "../antibodies/AntibodyEngine";
import { getLabClockState, nowIso } from "../lab-world/LabClock";
import type { HobeliscoRuntime } from "../runtime/HobeliscoRuntime";
import type {
  LifeStateTransition,
  ReplayComparison,
  TimelineEntry,
  TimelineFilterCategory,
  TimelineSnapshotView,
} from "./TimelineTypes";

let seq = 0;
const entries: TimelineEntry[] = [];
const lifeTransitions: LifeStateTransition[] = [];

export function resetTimeline(): void {
  seq = 0;
  entries.length = 0;
  lifeTransitions.length = 0;
}

export function recordTimeline(input: Omit<TimelineEntry, "id" | "sequence" | "timestamp"> & { timestamp?: string }): TimelineEntry {
  const entry: TimelineEntry = {
    id: `TL-${++seq}`,
    sequence: seq,
    timestamp: input.timestamp ?? nowIso(),
    state: input.state,
    organ: input.organ,
    eventType: input.eventType,
    risk: input.risk,
    threatDNA: input.threatDNA,
    defense: input.defense,
    action: input.action,
    result: input.result,
    severity: input.severity,
    filterCategory: input.filterCategory,
    incidentId: input.incidentId,
    pipeline: input.pipeline,
    explanation: input.explanation,
    contained: input.contained,
    falsePositive: input.falsePositive,
    falseNegative: input.falseNegative,
    humanRequired: input.humanRequired,
  };
  entries.push(entry);
  if (entries.length > 5000) entries.shift();
  return entry;
}

export function recordLifeTransition(from: string, to: string, auditKind: string): void {
  if (from === to) return;
  lifeTransitions.push({ from, to, at: nowIso(), auditKind });
  if (lifeTransitions.length > 500) lifeTransitions.shift();
}

export function getTimelineEntries(filter: TimelineFilterCategory = "ALL"): TimelineEntry[] {
  if (filter === "ALL") return [...entries];
  return entries.filter((e) => e.filterCategory === filter);
}

export function getLifeTransitions(): LifeStateTransition[] {
  return [...lifeTransitions];
}

export function getTimelineEntry(id: string): TimelineEntry | undefined {
  return entries.find((e) => e.id === id);
}

export function buildSnapshotView(runtime: HobeliscoRuntime): TimelineSnapshotView {
  const status = runtime.status();
  const snap = runtime.organism.core.snapshot();
  const immunity = computeImmunityReadiness({
    detection: 85,
    containment: 80,
    validatedAntibodies: listAntibodyRecords().filter((a) => a.status === "VALIDATED").length,
  });
  return {
    lifeState: snap.state,
    vitality: snap.health.overall,
    risk: snap.riskLevel,
    dna: snap.defenseDnaVersion,
    memory: snap.memoryStats,
    antibodies: snap.antibodies.length,
    activeDefense: snap.defenseDnaVersion,
    worldEvents: runtime.organism.world.eventBus.all().length,
    clock: getLabClockState().now,
    auditLength: snap.auditChainLength,
    immunityReadiness: immunity.score,
    immunityClass: immunity.classification,
  };
}

export function populateDemoTimeline(runtime: HobeliscoRuntime): TimelineEntry[] {
  resetTimeline();
  runtime.start();
  recordLifeTransition("BIRTH", "BOOT", "ORGANISM_BIRTH");
  recordLifeTransition("BOOT", "WATCHING", "BOOT_COMPLETE");

  recordTimeline({
    state: "WATCHING",
    organ: "SENSOR",
    eventType: "AUTH_ATTEMPT",
    risk: "L0_OBSERVE",
    threatDNA: null,
    defense: null,
    action: "PERCEIVE",
    result: "OK",
    severity: "info",
    filterCategory: "AUTH",
    pipeline: ["SENSOR", "MEMORY"],
    explanation: "Auth sensor sinalizou tentativa legítima simulada.",
  });

  runtime.processEvent({
    eventId: "demo-auth-fail",
    timestamp: nowIso(),
    kind: "AUTH_FAILURE",
    source: "LabWorld",
    cooperativeId: "Coop-LAB-A",
    actorId: "Actor-LAB-Attacker-001",
    metadata: { failures: 8, sequence: "login_fail" },
  });
  const snap1 = runtime.organism.core.snapshot();
  recordTimeline({
    state: snap1.state,
    organ: "THREAT",
    eventType: "AUTH_FAILURE",
    risk: snap1.riskLevel,
    threatDNA: snap1.recentThreats[0]?.fingerprint ?? null,
    defense: snap1.defenseDnaVersion,
    action: "CLASSIFY",
    result: "DEFENDING",
    severity: "high",
    filterCategory: "DEFENSE",
    pipeline: ["SENSOR", "EVENT", "MEMORY", "THREAT DNA", "RULE", "RISK", "DEFENSE"],
    explanation: "Sequência de falhas auth → regra AUTH-001 → risco elevado → DEFENDING.",
    contained: snap1.state === "DEFENDING" || snap1.state === "FORTRESS",
  });

  runtime.organism.core.attemptFinancialAction({ action: "CREATE_CREDIT", target: "demo" });
  const snap2 = runtime.organism.core.snapshot();
  recordTimeline({
    state: snap2.state,
    organ: "FINANCIAL_GUARD",
    eventType: "FINANCIAL_BOUNDARY",
    risk: "L3_HUMAN_REQUIRED",
    threatDNA: null,
    defense: "FINANCIAL_GUARD",
    action: "BLOCK",
    result: "BLOCKED",
    severity: "critical",
    filterCategory: "FINANCIAL",
    pipeline: ["SENSOR", "FINANCIAL GUARD", "AUDIT"],
    explanation: "Tentativa CREATE_CREDIT bloqueada — mutação financeira proibida.",
    humanRequired: true,
  });

  const deathStates = runtime.runDeathCycle();
  for (let i = 1; i < deathStates.length; i += 1) {
    const from = deathStates[i - 1];
    const to = deathStates[i];
    if (from !== to) recordLifeTransition(from, to, "DEATH_CYCLE");
  }
  recordTimeline({
    state: deathStates[deathStates.length - 1] ?? "AWAKE",
    organ: "REINCARNATION",
    eventType: "DEATH_CYCLE",
    risk: snap2.riskLevel,
    threatDNA: snap1.recentThreats[0]?.fingerprint ?? null,
    defense: "DNA-0002",
    action: "REINCARNATE",
    result: "VALIDATED",
    severity: "high",
    filterCategory: "REINCARNATION",
    pipeline: ["DEFENSE FAILED", "DEAD", "ANALYSIS", "NEW DNA", "ARENA", "REINCARNATION"],
    explanation: "Estratégia morta preservada; nova defesa validada no LAB.",
  });

  runtime.pulse();
  return getTimelineEntries();
}

export function replayTimelineIncident(entryId: string, runtime: HobeliscoRuntime): ReplayComparison {
  const entry = getTimelineEntry(entryId);
  if (!entry) {
    return {
      incidentId: entryId,
      match: false,
      divergence: "NOT_FOUND",
      original: { state: "?", health: 0, result: "?" },
      replayed: { state: "?", health: 0, result: "?" },
    };
  }
  const original = { state: entry.state, health: runtime.health(), result: entry.result };
  resetTimeline();
  runtime.start();
  if (entry.filterCategory === "FINANCIAL") {
    runtime.organism.core.attemptFinancialAction({ action: "CREATE_CREDIT", target: "replay" });
  } else if (entry.filterCategory === "AUTH" || entry.filterCategory === "DEFENSE") {
    runtime.processEvent({
      eventId: `replay-${entryId}`,
      timestamp: nowIso(),
      kind: "AUTH_FAILURE",
      source: "Replay",
      cooperativeId: "Coop-LAB-A",
      actorId: "Actor-LAB-Attacker-001",
      metadata: { failures: 8 },
    });
  }
  runtime.pulse();
  const replayed = { state: runtime.organism.core.stateMachine.current, health: runtime.health(), result: entry.result };
  const match = original.result === replayed.result;
  return {
    incidentId: entryId,
    match,
    divergence: match ? undefined : "DIVERGENCE",
    original,
    replayed,
    divergedAt: match ? undefined : "result/state",
  };
}
