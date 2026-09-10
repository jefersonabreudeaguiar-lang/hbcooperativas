/** Pulse integrado — verifica órgãos a cada batimento */

import type { HobeliscoCore } from "../core/HobeliscoCore";
import { LabBoundary } from "../lab-world/LabBoundary";
import { nowIso } from "../lab-world/LabClock";
import type { FortressLevel, HobeliscoState, RiskLevel, SensorSignal } from "../types";
import { incrementHeartbeat, updateOrganismIdentity } from "./OrganismIdentity";

export interface HobeliscoPulseResult {
  pulseId: string;
  timestamp: string;
  vitalState: HobeliscoState;
  health: number;
  risk: RiskLevel;
  sensors: SensorSignal[];
  memory: { short: number; mid: number; long: number };
  audit: { length: number; ok: boolean };
  boundaries: { violations: number };
  actions: string[];
  warnings: string[];
}

export function runHobeliscoPulse(core: HobeliscoCore, pulseIndex?: number): HobeliscoPulseResult {
  const idx = pulseIndex ?? incrementHeartbeat();
  const boundary = new LabBoundary(core.audit);
  const snap = core.snapshot();
  const warnings: string[] = [];
  const actions: string[] = [];

  boundary.check("LAB_EVENT_BUS");
  boundary.check("PROD_API");

  const auditOk = core.audit.verify().ok;
  if (!auditOk) warnings.push("AUDIT_DEGRADED");
  if (snap.memoryStats.short + snap.memoryStats.mid === 0) warnings.push("MEMORY_EMPTY");
  if (!snap.heart.selfWatchOk) warnings.push("SELF_WATCH_DEGRADED");
  if (snap.circuitBreaker.open) warnings.push("CIRCUIT_OPEN");

  if (snap.health.overall < 40 && core.stateMachine.current === "WATCHING") {
    try {
      core.stateMachine.transition("DEFENDING");
      actions.push("STATE→DEFENDING");
    } catch {
      /* already defending */
    }
  }

  if (snap.fortressLevel === "FORTRESS" && core.stateMachine.current !== "FORTRESS") {
    try {
      core.stateMachine.transition("FORTRESS");
      actions.push("STATE→FORTRESS");
    } catch {
      core.stateMachine.force("FORTRESS");
    }
  }

  updateOrganismIdentity({
    vitalState: core.stateMachine.current,
    health: snap.health.overall,
    riskLevel: snap.riskLevel,
    fortressLevel: snap.fortressLevel as FortressLevel,
    metabolism: snap.defenseBudget.level,
    memoryHealth: Math.min(100, (snap.memoryStats.short + snap.memoryStats.mid) * 5),
    sensorHealth: snap.sensors.every((s) => s.level !== "CRIT") ? 100 : 50,
    auditHealth: auditOk ? 100 : 0,
    dnaId: snap.defenseDnaVersion,
  });

  core.audit.append("PULSE", {
    pulseId: `PULSE-${idx}`,
    health: snap.health.overall,
    state: core.stateMachine.current,
    warnings,
  });

  return {
    pulseId: `PULSE-${idx}`,
    timestamp: nowIso(),
    vitalState: core.stateMachine.current,
    health: snap.health.overall,
    risk: snap.riskLevel,
    sensors: snap.sensors,
    memory: snap.memoryStats,
    audit: { length: snap.auditChainLength, ok: auditOk },
    boundaries: { violations: boundary.violationCount },
    actions,
    warnings,
  };
}
