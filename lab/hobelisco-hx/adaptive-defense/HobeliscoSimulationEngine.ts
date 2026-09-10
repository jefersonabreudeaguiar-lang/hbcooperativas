import { performance } from "perf_hooks";
import type { HobeliscoEventKind } from "../events/HobeliscoEvent";
import { resetLabClock } from "../lab-world/LabClock";
import { COOP_LAB_A, resetLabWorld } from "../lab-world/LabWorld";
import { HobeliscoRuntime, resetHobeliscoRuntime } from "../runtime/HobeliscoRuntime";
import { resetOrganismIdentity } from "../organism/OrganismIdentity";
import { ActiveDefenseExecutor } from "./ActiveDefenseExecutor";
import type { GeneratedScenario, ScenarioExecutionResult, ScenarioOutcome } from "./types";
import { assertSimulationAllowed, assertTargetAllowed, loadSimulationSafetyConfig } from "./SimulationSafety";
import { DEFAULT_POLICY_VERSION } from "./DefensePolicyStore";
import { HobeliscoSecurityFabric, loadFabricMode } from "../security-fabric/HobeliscoSecurityFabric";
import { evaluateAuthRisk } from "../security-fabric/AuthRiskEngine";
import { evaluateSessionGuard } from "../security-fabric/SessionGuard";

const BLOCKING_ACTIONS = new Set(["REJECT", "REPLAY_REJECTION", "PAYLOAD_REJECTION", "QUARANTINE", "TEMPORARY_BLOCK"]);

const FAMILY_TO_EVENT: Record<string, HobeliscoEventKind> = {
  T01_AUTH: "AUTH_FAILURE",
  T02_AUTHZ: "IDOR_ATTEMPT",
  T03_INJECTION: "API_ANOMALY",
  T04_WEB_API: "API_ANOMALY",
  T05_CRYPTO: "INTEGRITY_FAILURE",
  T06_SESSION: "AUTH_FAILURE",
  T07_RATE: "RATE_SPIKE",
  T09_CONFIG: "SYSTEM_ANOMALY",
  T10_INTEGRITY: "INTEGRITY_FAILURE",
  T11_SYNC: "SYNC_ANOMALY",
  T12_HB_CREDIT: "CREDIT_ANOMALY",
  T13_ADMIN: "ADMIN_ANOMALY",
  T14_INSIDER: "UNKNOWN_BEHAVIOR",
};

export class HobeliscoSimulationEngine {
  readonly executor = new ActiveDefenseExecutor();
  readonly fabric: HobeliscoSecurityFabric;
  private financialMutations = 0;

  constructor(fabricMode?: import("../security-fabric/HobeliscoSecurityFabric").FabricMode) {
    const mode = fabricMode ?? loadFabricMode();
    this.fabric = new HobeliscoSecurityFabric(mode === "OFF" ? "OBSERVE" : mode);
  }

  executeScenario(scenario: GeneratedScenario, policyVersion = DEFAULT_POLICY_VERSION): ScenarioExecutionResult {
    const safety = loadSimulationSafetyConfig();
    const allowed = assertSimulationAllowed(safety);
    if (!allowed.ok) {
      return {
        scenarioId: scenario.scenarioId,
        outcome: "ERROR",
        defenseAction: null,
        detected: false,
        blocked: false,
        latencyMs: 0,
        policyVersion,
        error: allowed.reason,
      };
    }

    const targetCheck = assertTargetAllowed("localhost");
    if (!targetCheck.ok) {
      return {
        scenarioId: scenario.scenarioId,
        outcome: "ERROR",
        defenseAction: null,
        detected: false,
        blocked: false,
        latencyMs: 0,
        policyVersion,
        error: targetCheck.reason,
      };
    }

    const start = performance.now();
    resetOrganismIdentity();
    resetLabWorld();
    resetLabClock(scenario.seed);
    const runtime = resetHobeliscoRuntime();
    runtime.start();

    const eventKind = FAMILY_TO_EVENT[scenario.family] ?? "UNKNOWN_BEHAVIOR";
    runtime.processEvent({
      eventId: scenario.scenarioId,
      timestamp: new Date().toISOString(),
      kind: eventKind,
      source: "AdaptiveDefenseLab",
      cooperativeId: COOP_LAB_A,
      actorId: `Actor-${scenario.identityState}`,
      metadata: { failures: scenario.frequency, sequence: scenario.sequence.join(",") },
    });

    const threat = runtime.organism.core.reason({
      sequence: scenario.sequence,
      endpoint: scenario.route,
      cooperativeCnpj: COOP_LAB_A,
      failures: scenario.frequency,
    });

    let detected = threat.severity !== "low";
    let blocked = false;
    let defenseAction = null;

    if (!scenario.isLegitimate) {
      runtime.organism.core.actOnThreat(threat);

      const authRisk = evaluateAuthRisk({
        failures: scenario.frequency,
        windowMs: scenario.timingMs || 1000,
        identityState: scenario.identityState,
        route: scenario.route,
        sequence: scenario.sequence,
      });
      const sessionRisk = evaluateSessionGuard({
        sequence: scenario.sequence,
        route: scenario.route,
        timestampMs: scenario.timingMs,
      });

      const fabricDecision = this.fabric.evaluate({
        family: scenario.family,
        route: scenario.route,
        severity: scenario.severity,
        frequency: scenario.frequency,
        sequence: scenario.sequence,
        identityState: scenario.identityState,
        isLegitimate: false,
        environment: safety.environment,
      });

      const action = this.executor.selectAction(scenario.family, scenario.severity, scenario.frequency);
      const def = this.executor.execute(action, {
        target: scenario.route,
        family: scenario.family,
        environment: safety.environment,
      });
      defenseAction = (fabricDecision.action as typeof defenseAction) ?? def.action;

      blocked =
        fabricDecision.blocked ||
        (fabricDecision.wouldBlock && this.fabric.mode === "CONTROLLED_BLOCK" && BLOCKING_ACTIONS.has(fabricDecision.action ?? "")) ||
        def.blocked ||
        (authRisk.wouldBlock && scenario.family === "T01_AUTH" && scenario.frequency >= 10) ||
        (sessionRisk.wouldBlock && scenario.family === "T06_SESSION");

      if (scenario.family === "T12_HB_CREDIT" || scenario.sequence.some((s) => s.includes("alter"))) {
        const fin = runtime.organism.core.attemptFinancialAction({
          action: "ALTER_LEDGER",
          target: "hb_credit_accounts",
        });
        if (!fin.blocked) this.financialMutations += 1;
      }
    }

    runtime.pulse();
    const snap = runtime.organism.core.snapshot();
    const latencyMs = performance.now() - start;

    let outcome: ScenarioOutcome;
    if (scenario.isLegitimate) {
      outcome = blocked ? "FALSE_POSITIVE" : "INCONCLUSIVE";
    } else if (blocked) {
      outcome = "BLOCKED";
    } else if (detected || snap.state === "DEFENDING" || snap.state === "FORTRESS") {
      outcome = "DETECTED_ONLY";
    } else {
      outcome = "MISSED";
    }

    return {
      scenarioId: scenario.scenarioId,
      outcome,
      defenseAction,
      detected: detected || snap.recentThreats.length > 0,
      blocked,
      latencyMs,
      policyVersion,
    };
  }

  getFinancialMutations(): number {
    return this.financialMutations;
  }

  reset(): void {
    this.executor.reset();
    this.financialMutations = 0;
  }
}
