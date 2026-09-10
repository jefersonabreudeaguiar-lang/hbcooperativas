/**
 * HobeliscoRuntime — executor do ciclo vital LAB
 * Wrapper sobre HobeliscoLabOrganism (não duplica Core V1)
 */

import type { HobeliscoState } from "../types";
import type { HobeliscoEvent } from "../events/HobeliscoEvent";
import { eventToSensorContext } from "../events/HobeliscoEvent";
import { HOBELISCO_CLOSURE_VERSION } from "../config";
import { nowIso } from "../lab-world/LabClock";
import {
  createFullSnapshot,
  restoreFullSnapshot,
  type FullLabSnapshot,
} from "../evolution/LabSnapshot";
import { HobeliscoLabOrganism, resetHobeliscoLabOrganism } from "../organism/HobeliscoLabOrganism";
import type { HobeliscoPulseResult } from "../organism/HobeliscoPulse";
import type { OrganismStatus } from "../organism/HobeliscoLabOrganism";

export class HobeliscoRuntime {
  readonly organism: HobeliscoLabOrganism;
  private active = false;
  private transitionLog: string[] = [];

  constructor(organism?: HobeliscoLabOrganism) {
    this.organism = organism ?? resetHobeliscoLabOrganism();
  }

  start(): { bootOk: boolean; state: HobeliscoState } {
    process.env.HOBELISCO_ENVIRONMENT = "LAB";
    const boot = this.organism.boot();
    this.active = boot.success;
    this.logTransition("START", this.organism.core.stateMachine.current);
    return { bootOk: boot.success, state: this.organism.core.stateMachine.current };
  }

  stop(): void {
    this.organism.stop();
    this.active = false;
    this.organism.core.audit.append("RUNTIME_STOP", { at: nowIso() });
  }

  pulse(): HobeliscoPulseResult {
    if (!this.active) this.start();
    return this.organism.pulse();
  }

  processEvent(event: HobeliscoEvent): void {
    this.organism.core.audit.append("HOBELISCO_EVENT", { kind: event.kind, eventId: event.eventId });
    const ctx = eventToSensorContext(event);
    this.organism.core.perceive(ctx);

    const needsThreat =
      event.kind.includes("FAILURE") ||
      event.kind.includes("ANOMALY") ||
      event.kind.includes("ATTEMPT") ||
      event.kind === "UNKNOWN_BEHAVIOR" ||
      event.kind === "RATE_SPIKE";

    if (needsThreat) {
      const seqMeta = event.metadata.sequence;
      const seqExtra =
        typeof seqMeta === "string"
          ? seqMeta.split(",").filter(Boolean)
          : Array.isArray(seqMeta)
            ? seqMeta.map(String)
            : [];
      const threat = this.organism.core.reason({
        sequence: [event.kind, ...seqExtra],
        endpoint: event.endpoint ?? `/lab/${event.kind}`,
        cooperativeCnpj: event.cooperativeId,
        failures: Number(event.metadata.failures ?? 3),
      });
      this.organism.core.actOnThreat(threat);
    }
  }

  transition(to: HobeliscoState): HobeliscoState {
    const from = this.organism.core.stateMachine.current;
    if (!this.organism.core.stateMachine.canTransition(to)) {
      this.organism.core.audit.append("TRANSITION_BLOCKED", { from, to });
      throw new Error(`TRANSITION_BLOCKED: ${from} → ${to}`);
    }
    const next = this.organism.core.stateMachine.transition(to);
    this.organism.core.audit.append("STATE_TRANSITION", { from, to: next });
    this.logTransition(from, next);
    return next;
  }

  snapshot(): FullLabSnapshot {
    return createFullSnapshot(this.organism);
  }

  restore(snapshot: FullLabSnapshot): boolean {
    const ok = restoreFullSnapshot(this.organism, snapshot);
    if (ok) this.organism.core.audit.append("RUNTIME_RESTORE", { snapshotId: snapshot.id });
    return ok;
  }

  health(): number {
    return this.organism.core.snapshot().health.overall;
  }

  status(): OrganismStatus & { runtimeVersion: string; active: boolean; transitions: string[] } {
    const s = this.organism.getOrganismStatus();
    return {
      ...s,
      runtimeVersion: HOBELISCO_CLOSURE_VERSION,
      active: this.active,
      transitions: [...this.transitionLog],
    };
  }

  runDeathCycle(): string[] {
    const sm = this.organism.core.stateMachine;
    const states: string[] = [sm.current];

    if (sm.current === "SAFE_MODE") {
      sm.force("WATCHING");
      states.push("WATCHING");
      this.logTransition("SAFE_MODE", "WATCHING");
    }

    const path: HobeliscoState[] = [
      "DEFENDING",
      "FAILED",
      "DEAD",
      "ANALYSIS",
      "REINCARNATING",
      "BOOT",
      "AWAKE",
    ];

    for (const to of path) {
      const from = sm.current;
      try {
        const next = this.transition(to);
        if (states[states.length - 1] !== next) states.push(next);
      } catch {
        sm.force(to);
        if (from !== to && states[states.length - 1] !== to) {
          states.push(to);
          this.organism.core.audit.append("DEATH_CYCLE_FORCE", { from, to });
          this.logTransition(from, to);
        }
      }
    }
    return states;
  }

  private logTransition(from: string, to: string): void {
    this.transitionLog.push(`${from}→${to}`);
  }
}

let runtimeInstance: HobeliscoRuntime | null = null;

export function getHobeliscoRuntime(): HobeliscoRuntime {
  if (!runtimeInstance) runtimeInstance = new HobeliscoRuntime();
  return runtimeInstance;
}

export function resetHobeliscoRuntime(): HobeliscoRuntime {
  runtimeInstance = new HobeliscoRuntime();
  return runtimeInstance;
}
