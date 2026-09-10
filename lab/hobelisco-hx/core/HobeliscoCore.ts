/** HOBELISCO CORE V1 — PERCEIVE REMEMBER REASON ACT VERIFY */

import { AuditChain } from "../audit/AuditChain";
import { listAntibodies, matchAntibodyForThreat } from "../antibodies/AntibodyRegistry";
import { HOBELISCO_VERSION, loadHobeliscoFlags } from "../config";
import { HOBELISCO_MANIFESTO } from "../dna/manifesto";
import { getLatestDefenseDna } from "../dna/DefenseDNA";
import { HOBELISCO_INVARIANTS } from "../dna/invariants";
import { evaluateFinancialAction } from "../financial/FinancialGuard";
import { computeFortressLevel } from "../fortress/FortressMode";
import { runGuardianCycle } from "../guardian/Guardian";
import { emitHeartbeat } from "../heart/HobeliscoHeart";
import { computeHealth } from "../health/HealthScore";
import { extractLearningInsights } from "../learning/LearningEngine";
import { computeDefenseBudget } from "../metabolism/DefenseBudget";
import { ImmuneSystem } from "../immune/ImmuneSystem";
import { MemoryStore } from "../memory/MemoryStore";
import { attemptAutoRepair } from "../remediation/AutoRepair";
import { classifyRisk, riskAllowsAutoRepair } from "../risk/RiskEngine";
import { matchRules, countActiveRules } from "../rules/RuleEngine";
import { runAllSensors } from "../sensors/index";
import { getLabPersistence, resetLabPersistence } from "../storage/LabPersistence";
import { HobeliscoStateMachine } from "../state/HobeliscoStateMachine";
import { classifyThreat } from "../threat/ThreatClassifier";
import { CircuitBreaker } from "../validation/CircuitBreaker";
import type {
  FinancialActionAttempt,
  Heartbeat,
  HobeliscoSnapshot,
  RiskLevel,
  SensorSignal,
  ThreatFingerprint,
} from "../types";

export class HobeliscoCore {
  readonly audit = new AuditChain();
  readonly memory = new MemoryStore();
  readonly immune = new ImmuneSystem();
  readonly stateMachine = new HobeliscoStateMachine();
  readonly circuitBreaker = new CircuitBreaker();
  readonly persistence = getLabPersistence();
  readonly flags = loadHobeliscoFlags();

  private sensorContext: Parameters<typeof runAllSensors>[0] = {};
  private threats: ThreatFingerprint[] = [];
  private currentRisk: RiskLevel = "L0_OBSERVE";
  private lastGuardian = runGuardianCycle({
    beforeHealth: 100,
    afterHealth: 100,
    sensors: [],
    repairAttempted: false,
    repairSucceeded: true,
  });

  constructor() {
    this.boot();
  }

  boot(): void {
    resetLabPersistence();
    this.audit.append("BIRTH", { version: HOBELISCO_VERSION });
    this.stateMachine.bootSequence();
    this.audit.append("BOOT_COMPLETE", { state: this.stateMachine.current });
    const head = this.audit.getHead();
    if (head) this.persistence.recordEvent(head);
    this.memory.remember({
      layer: "short",
      kind: "boot",
      summary: "Organismo V1 inicializado no lab",
      origin: "core",
      context: "arena",
      result: "success",
      defenseUsed: null,
      efficacy: 100,
    });
  }

  perceive(context?: Parameters<typeof runAllSensors>[0]): SensorSignal[] {
    this.sensorContext = { ...this.sensorContext, ...context };
    const sensors = runAllSensors(this.sensorContext);
    this.audit.append("PERCEIVE", { sensorCount: sensors.length });
    return sensors;
  }

  remember(
    kind: string,
    summary: string,
    extra?: Partial<Parameters<MemoryStore["remember"]>[0]>
  ): void {
    this.memory.remember({
      layer: "short",
      kind,
      summary,
      ...extra,
    });
  }

  reason(threatInput: Parameters<typeof classifyThreat>[0]): ThreatFingerprint {
    const threat = classifyThreat(threatInput);
    this.threats.unshift(threat);
    if (this.threats.length > 20) this.threats.pop();
    this.persistence.recordThreat(threat);

    const matched = matchRules({ threat, sensors: runAllSensors(this.sensorContext) });
    this.currentRisk = classifyRisk(matched);

    const antibody = matchAntibodyForThreat(threat);
    this.memory.remember({
      layer: "mid",
      kind: "threat",
      summary: `${threat.fingerprint} ${threat.severity}`,
      origin: "threat_classifier",
      context: threat.sequence.join("→"),
      result: antibody ? `antibody ${antibody.id}` : "no_match",
      defenseUsed: antibody?.id ?? matched[0]?.id ?? null,
      efficacy: antibody ? 85 : 50,
    });

    this.audit.append("THREAT_CLASSIFIED", {
      id: threat.id,
      fingerprint: threat.fingerprint,
      severity: threat.severity,
      risk: this.currentRisk,
    });
    return threat;
  }

  actOnThreat(threat: ThreatFingerprint): void {
    if (this.stateMachine.current === "WATCHING") {
      try {
        this.stateMachine.transition("DEFENDING");
      } catch {
        /* already defending */
      }
    }

    const matched = matchRules({ threat, sensors: runAllSensors(this.sensorContext) });
    this.currentRisk = classifyRisk(matched);
    this.immune.respond(threat);

    if (this.currentRisk === "L3_HUMAN_REQUIRED") {
      this.persistence.recordIncident({
        kind: threat.fingerprint,
        severity: threat.severity,
        status: "open",
      });
    }

    this.audit.append("IMMUNE_RESPONSE", { threatId: threat.id, risk: this.currentRisk });
  }

  attemptAutoRepair(action: string): ReturnType<typeof attemptAutoRepair> {
    if (!this.flags.autoRepair && !action) {
      return {
        allowed: false,
        action,
        rolledBack: false,
        humanRequired: true,
        message: "AUTO_REPAIR desabilitado por flag",
      };
    }

    if (!this.circuitBreaker.canAttemptRepair()) {
      return {
        allowed: false,
        action,
        rolledBack: true,
        humanRequired: true,
        message: "Circuit breaker aberto — reparos suspensos",
      };
    }

    if (!riskAllowsAutoRepair(this.currentRisk)) {
      return {
        allowed: false,
        action,
        rolledBack: false,
        humanRequired: this.currentRisk === "L3_HUMAN_REQUIRED",
        message: `Risco ${this.currentRisk} não permite auto-repair`,
      };
    }

    const result = attemptAutoRepair(action);
    this.audit.append("AUTO_REPAIR", { action, allowed: result.allowed });

    if (!result.allowed) {
      this.circuitBreaker.recordFailure(result.message);
    } else {
      this.circuitBreaker.recordSuccess();
    }

    this.memory.remember({
      layer: "mid",
      kind: "repair",
      summary: result.message,
      origin: "auto_repair",
      context: action,
      result: result.allowed ? "success" : "blocked",
      defenseUsed: action,
      efficacy: result.allowed ? 90 : 0,
    });

    return result;
  }

  attemptFinancialAction(attempt: FinancialActionAttempt): { blocked: boolean; reason?: string } {
    const verdict = evaluateFinancialAction(attempt);
    this.audit.append("FINANCIAL_GUARD", { action: attempt.action, allowed: verdict.allowed });
    if (!verdict.allowed) {
      this.memory.remember({
        layer: "long",
        kind: "financial_incident",
        summary: verdict.reason,
        origin: "financial_guard",
        context: attempt.target,
        result: "blocked",
        defenseUsed: "FINANCIAL_GUARD",
        efficacy: 100,
      });
      this.persistence.recordIncident({
        kind: "financial_blocked",
        severity: "critical",
        status: "contained",
      });
      this.stateMachine.force("SAFE_MODE");
      this.currentRisk = "L3_HUMAN_REQUIRED";
      return { blocked: true, reason: verdict.reason };
    }
    return { blocked: false };
  }

  verify(repairAttempted: boolean, repairSucceeded: boolean, beforeHealth: number): void {
    const sensors = runAllSensors(this.sensorContext);
    const health = computeHealth(sensors);
    this.lastGuardian = runGuardianCycle({
      beforeHealth,
      afterHealth: health.overall,
      sensors,
      repairAttempted,
      repairSucceeded,
    });
    this.audit.append("GUARDIAN", { ok: this.lastGuardian.ok, stage: this.lastGuardian.stage });

    if (!this.lastGuardian.ok) {
      this.circuitBreaker.recordFailure(this.lastGuardian.stage);
    } else if (repairAttempted) {
      this.circuitBreaker.recordSuccess();
    }

    if (this.lastGuardian.ok && this.stateMachine.current === "DEFENDING") {
      try {
        this.stateMachine.recoveryLearningCycle();
      } catch {
        this.stateMachine.force("WATCHING");
      }
    }
  }

  pulse(): Heartbeat {
    const snap = this.snapshot();
    return snap.heart;
  }

  snapshot(): HobeliscoSnapshot {
    const sensors = runAllSensors(this.sensorContext);
    const health = computeHealth(sensors, this.threats.length > 3 ? 5 : 0);
    const fortressLevel = computeFortressLevel(health.overall, this.flags.fortress);
    const defenseBudget = computeDefenseBudget(fortressLevel, sensors);
    const dna = getLatestDefenseDna();
    const auditOk = this.audit.verify().ok;

    const heart = emitHeartbeat({
      healthScore: health.overall,
      state: this.stateMachine.current,
      fortressLevel,
      threatCount: this.threats.length,
      sensors,
      auditChainOk: auditOk,
      memoryOk: this.memory.stats().short + this.memory.stats().mid > 0,
    });

    return {
      version: HOBELISCO_VERSION,
      state: this.stateMachine.current,
      flags: this.flags,
      heart,
      health,
      fortressLevel,
      defenseBudget,
      circuitBreaker: this.circuitBreaker.snapshot(),
      riskLevel: this.currentRisk,
      sensors,
      memoryStats: this.memory.stats(),
      recentMemory: this.memory.recent(),
      auditChainHead: this.audit.getHead(),
      auditChainLength: this.audit.length,
      defenseDnaVersion: dna.version,
      invariants: [...HOBELISCO_INVARIANTS],
      rulesActive: countActiveRules(),
      antibodies: listAntibodies(),
      recentThreats: this.threats.slice(0, 5),
      recentImmune: this.immune.recent,
      lastGuardian: this.lastGuardian,
      learningInsights: extractLearningInsights(this.memory.all()),
      manifestoPrinciples: [...HOBELISCO_MANIFESTO],
    };
  }
}

let instance: HobeliscoCore | null = null;

export function getHobeliscoCore(): HobeliscoCore {
  if (!instance) instance = new HobeliscoCore();
  return instance;
}

export function resetHobeliscoCore(): HobeliscoCore {
  instance = new HobeliscoCore();
  return instance;
}
