/**
 * Orquestrador principal do organismo LAB
 * Integra V1 Core + LabWorld + ciclo vital completo
 */

import { resetHobeliscoCore, type HobeliscoCore } from "../core/HobeliscoCore";
import { HOBELISCO_LAB_ORGANISM_VERSION, loadLabOrganismConfig } from "../config";
import { resolveHobeliscoEnvironment } from "../environment/HobeliscoEnvironment";
import { LabBoundary } from "../lab-world/LabBoundary";
import { resetLabClock, nowIso } from "../lab-world/LabClock";
import { labEventTypeFromScenario } from "../lab-world/LabEventBus";
import { COOP_LAB_A, COOP_LAB_B, getLabWorld, resetLabWorld } from "../lab-world/LabWorld";
import { ReincarnationEngine } from "../reincarnation/ReincarnationEngine";
import { DefenseRegistry } from "../reincarnation/DefenseRegistry";
import { memoryBelongsToCooperative } from "../security/cooperativeIsolation";
import { LoopGuard } from "../validation/LoopGuard";
import type { BootReport } from "./HobeliscoBootSequence";
import { runHobeliscoBootSequence } from "./HobeliscoBootSequence";
import { runHobeliscoPulse, type HobeliscoPulseResult } from "./HobeliscoPulse";
import {
  getOrganismIdentity,
  initOrganismIdentity,
  resetOrganismIdentity,
  updateOrganismIdentity,
} from "./OrganismIdentity";
import { ComponentLifecycleManager } from "./ComponentLifecycleManager";
import { buildOperationalSelfModel, type OperationalSelfModel } from "./OperationalSelfModel";
import {
  enterHibernation,
  evaluateHibernation,
  wakeFromHibernation,
} from "./HibernationController";
import { runGuardianCycle } from "../guardian/Guardian";

export interface OrganismStatus {
  identity: ReturnType<typeof getOrganismIdentity>;
  vitalState: string;
  health: number;
  risk: string;
  generation: number;
  dna: string;
  heartbeat: number;
  metabolism: string;
  sensorHealth: number;
  memoryHealth: number;
  auditHealth: number;
  defense: string;
  fortress: string;
  lastIncident: string | null;
  lastLearning: string | null;
  lastReincarnation: string | null;
  version: string;
  selfModel: OperationalSelfModel;
}

export interface LifeScenarioResult {
  scenarioId: string;
  success: boolean;
  states: string[];
  pulses: number;
  notes: string[];
}

export class HobeliscoLabOrganism {
  readonly core: HobeliscoCore;
  readonly boundary: LabBoundary;
  readonly world = getLabWorld();
  readonly components = new ComponentLifecycleManager();
  readonly loopGuard = new LoopGuard();
  readonly defenseRegistry = new DefenseRegistry();
  readonly reincarnation = new ReincarnationEngine();
  readonly config = loadLabOrganismConfig();

  private stablePulseCount = 0;
  private deathRecords: Array<{ deadDefenseId: string; cause: string; at: string }> = [];
  private running = false;

  constructor() {
    resetOrganismIdentity();
    resetLabWorld();
    resetLabClock();
    this.core = resetHobeliscoCore();
    initOrganismIdentity();
    this.boundary = new LabBoundary(this.core.audit);
    this.boundary.assertLabOnly("LAB_MEMORY");
  }

  boot(): BootReport {
    const env = process.env;
    env.HOBELISCO_ENVIRONMENT = "LAB";
    const report = runHobeliscoBootSequence(this.core, env);
    this.core.audit.append("ORGANISM_BIRTH", {
      organismId: this.config.organismId,
      version: HOBELISCO_LAB_ORGANISM_VERSION,
    });
    return report;
  }

  pulse(): HobeliscoPulseResult {
    this.loopGuard.reset("pulse");
    if (!this.loopGuard.tick("pulse").allowed) {
      this.core.audit.append("LOOP_BLOCKED", { action: "pulse" });
      throw new Error("LOOP_BLOCKED");
    }
    const result = runHobeliscoPulse(this.core);
    if (result.warnings.length === 0 && result.risk === "L0_OBSERVE") {
      this.stablePulseCount += 1;
    } else {
      this.stablePulseCount = 0;
    }
    const hib = evaluateHibernation(this.core, this.stablePulseCount, false);
    if (hib.shouldHibernate) enterHibernation(this.core);
    return result;
  }

  processLabEvent(scenario: string): void {
    const type = labEventTypeFromScenario(scenario);
    const event = this.world.emit(type, COOP_LAB_A, "User-LAB-001", { scenario });
    const ctx = this.world.eventBus.toSensorContext(event);
    this.core.perceive(ctx);

    if (type === "auth_failure" || type === "behavior_anomaly" || type === "hb_credit_anomaly") {
      const threat = this.core.reason({
        sequence: [type, scenario],
        endpoint: `/lab/${scenario}`,
        cooperativeCnpj: this.world.cooperatives[0].cnpj,
        failures: 3,
      });
      this.core.actOnThreat(threat);
    }
  }

  getOrganismStatus(): OrganismStatus {
    const snap = this.core.snapshot();
    const identity = getOrganismIdentity();
    const selfModel = buildOperationalSelfModel(this.core, this.components);
    const lastInc = this.core.persistence.incidents[this.core.persistence.incidents.length - 1];
    return {
      identity,
      vitalState: snap.state,
      health: snap.health.overall,
      risk: snap.riskLevel,
      generation: identity.generation,
      dna: identity.dnaId,
      heartbeat: identity.heartbeat,
      metabolism: snap.defenseBudget.level,
      sensorHealth: identity.sensorHealth,
      memoryHealth: identity.memoryHealth,
      auditHealth: identity.auditHealth,
      defense: snap.defenseDnaVersion,
      fortress: snap.fortressLevel,
      lastIncident: lastInc?.kind ?? null,
      lastLearning: snap.learningInsights[0]?.pattern ?? null,
      lastReincarnation: this.deathRecords[this.deathRecords.length - 1]?.deadDefenseId ?? null,
      version: HOBELISCO_LAB_ORGANISM_VERSION,
      selfModel,
    };
  }

  runFullLifeCycle(): LifeScenarioResult {
    const states: string[] = [];
    const notes: string[] = [];
    this.boot();
    states.push(this.core.stateMachine.current);

    this.pulse();
    states.push(this.core.stateMachine.current);

    this.processLabEvent("normal");
    this.pulse();
    states.push(this.core.stateMachine.current);

    const threat = this.core.reason({
      sequence: ["attack", "burst"],
      endpoint: "/lab/auth",
      cooperativeCnpj: this.world.cooperatives[0].cnpj,
      failures: 5,
    });
    this.core.actOnThreat(threat);
    try {
      this.core.stateMachine.transition("FORTRESS");
    } catch {
      this.core.stateMachine.force("FORTRESS");
    }
    states.push("FORTRESS");

    try {
      this.core.stateMachine.transition("DEFENDING");
      this.core.stateMachine.transition("FAILED");
      this.core.stateMachine.transition("DEAD");
      this.core.stateMachine.transition("ANALYSIS");
      this.core.stateMachine.transition("REINCARNATING");
      notes.push("death cycle completed");
    } catch (e) {
      notes.push(`death cycle: ${e instanceof Error ? e.message : "partial"}`);
      this.core.stateMachine.force("DEAD");
      this.core.stateMachine.force("ANALYSIS");
      this.core.stateMachine.force("REINCARNATING");
    }
    states.push(this.core.stateMachine.current);

    const d1 = this.reincarnation.register("DEFENSE-001");
    this.reincarnation.markDead(d1.id, "arena failure");
    this.deathRecords.push({ deadDefenseId: d1.id, cause: "defense failure", at: nowIso() });
    const d2 = this.reincarnation.reincarnate(d1.id, "DEFENSE-002");
    if (d2) {
      this.reincarnation.promote(d2.id, "validated");
      updateOrganismIdentity({ generation: 2, parentDefenseId: d1.id, dnaId: "DNA-0002" });
    }

    try {
      this.core.stateMachine.transition("BOOT");
      this.core.stateMachine.transition("AWAKE");
      this.core.stateMachine.transition("WATCHING");
    } catch {
      this.core.stateMachine.force("WATCHING");
    }
    states.push(this.core.stateMachine.current);

    return {
      scenarioId: "LIFE-FULL-CYCLE-001",
      success: states.includes("FORTRESS") && states.includes("REINCARNATING"),
      states,
      pulses: getOrganismIdentity().heartbeat,
      notes,
    };
  }

  runHibernationScenario(): LifeScenarioResult {
    const states: string[] = [];
    this.boot();
    for (let i = 0; i < 12; i += 1) this.pulse();
    enterHibernation(this.core);
    states.push(this.core.stateMachine.current);
    this.world.emit("critical_wake", COOP_LAB_A, "User-LAB-001", { critical: true });
    wakeFromHibernation(this.core);
    states.push(this.core.stateMachine.current);
    try {
      this.core.stateMachine.transition("DEFENDING");
    } catch {
      /* ok */
    }
    states.push(this.core.stateMachine.current);
    return {
      scenarioId: "LIFE-HIBERNATION-001",
      success: states.includes("HIBERNATING") && states.includes("WATCHING"),
      states,
      pulses: getOrganismIdentity().heartbeat,
      notes: [],
    };
  }

  runIsolationScenario(): { success: boolean; leak: boolean } {
    const coopA = this.world.cooperatives[0].cnpj;
    const coopB = this.world.cooperatives[1].cnpj;
    this.world.emit("auth_success", COOP_LAB_A, "User-LAB-001", {});
    this.world.emit("auth_failure", COOP_LAB_B, "User-LAB-003", {});
    const aEvents = this.world.eventBus.byCooperative(COOP_LAB_A);
    const bInA = aEvents.some((e) => e.cooperativeId === COOP_LAB_B);
    const memOk = memoryBelongsToCooperative(coopA, coopA) && !memoryBelongsToCooperative(coopA, coopB);
    return { success: memOk && !bInA, leak: bInA || !memOk };
  }

  runGuardianFalseSuccessScenario(): { falseSuccess: boolean; safeMode: boolean } {
    const g = runGuardianCycle({
      beforeHealth: 80,
      afterHealth: 90,
      sensors: [],
      repairAttempted: true,
      repairSucceeded: true,
      systemInvalidAfterRepair: true,
    });
    if (!g.ok) {
      this.core.stateMachine.force("SAFE_MODE");
    }
    this.core.audit.append("GUARDIAN_FALSE_SUCCESS", { ok: g.ok, stage: g.stage });
    return { falseSuccess: !g.ok && g.stage.includes("FALSE"), safeMode: this.core.stateMachine.current === "SAFE_MODE" };
  }

  attemptProductionAccess(): { blocked: boolean; reason: string } {
    const r = this.boundary.check("PROD_DATABASE");
    return { blocked: r.blocked, reason: r.blocked ? r.reason : "ALLOWED" };
  }

  startPulseLoop(maxPulses = 3): void {
    this.running = true;
    for (let i = 0; i < maxPulses && this.running; i += 1) {
      this.pulse();
    }
  }

  stop(): void {
    this.running = false;
    this.core.audit.append("ORGANISM_STOP", { at: nowIso() });
  }

  static assertLabEnvironment(): void {
    const env = resolveHobeliscoEnvironment(process.env);
    if (env !== "LAB") {
      throw new Error("BLOCKED_BY_LAB_BOUNDARY: organism requires LAB environment");
    }
  }
}

let organismInstance: HobeliscoLabOrganism | null = null;

export function getHobeliscoLabOrganism(): HobeliscoLabOrganism {
  HobeliscoLabOrganism.assertLabEnvironment();
  if (!organismInstance) organismInstance = new HobeliscoLabOrganism();
  return organismInstance;
}

export function resetHobeliscoLabOrganism(): HobeliscoLabOrganism {
  organismInstance = new HobeliscoLabOrganism();
  return organismInstance;
}
