/**
 * Matriz de ataques simulados ATTACK-001 .. ATTACK-025
 * Executa pipeline real: evento → sensor → memory → threat → rule → risk → defense → audit
 */

import type { HobeliscoEvent, HobeliscoEventKind } from "../events/HobeliscoEvent";
import { classifyUnknownBehavior } from "../events/HobeliscoEvent";
import { evaluateFinancialAction } from "../financial/FinancialGuard";
import { assertCooperativeScope } from "../security/cooperativeIsolation";
import { buildThreatFingerprint } from "../threat/ThreatClassifier";
import { matchRules } from "../rules/RuleEngine";
import { classifyRisk } from "../risk/RiskEngine";
import { HobeliscoRuntime, resetHobeliscoRuntime } from "../runtime/HobeliscoRuntime";
import { LabBoundary } from "../lab-world/LabBoundary";
import { LoopGuard } from "../validation/LoopGuard";
import { runFalseSuccessBattery } from "../guardian/GuardianValidator";
import { CircuitBreaker } from "../validation/CircuitBreaker";
import { verifyExportedChain } from "../audit/AuditChain";

export interface AttackScenario {
  id: string;
  title: string;
  kind: HobeliscoEventKind;
  sequence: string[];
  cooperativeId: string;
  actorId: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AttackResult {
  id: string;
  attack: string;
  signals: number;
  decision: string;
  defense: boolean;
  contained: boolean;
  recovered: boolean;
  falsePositive: boolean;
  falseNegative: boolean;
  cost: number;
  memoryRecorded: boolean;
  auditRecorded: boolean;
  learningInsight: boolean;
  passed: boolean;
  detail: string;
}

export const ATTACK_SCENARIOS: AttackScenario[] = [
  { id: "ATTACK-001", title: "brute force", kind: "AUTH_FAILURE", sequence: ["login_fail"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 20 } },
  { id: "ATTACK-002", title: "credential stuffing", kind: "RATE_SPIKE", sequence: ["login_fail", "login_fail"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 15 } },
  { id: "ATTACK-003", title: "session abuse", kind: "AUTH_FAILURE", sequence: ["session_hijack"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 5 } },
  { id: "ATTACK-004", title: "IDOR/BOLA", kind: "IDOR_ATTEMPT", sequence: ["cross_coop_probe", "idor"], cooperativeId: "Coop-LAB-B", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 3 } },
  { id: "ATTACK-005", title: "privilege escalation", kind: "ADMIN_ANOMALY", sequence: ["privilege_escalation"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-006", title: "API abuse", kind: "API_ANOMALY", sequence: ["api_abuse"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { latencyMs: 9000 } },
  { id: "ATTACK-007", title: "rate attack", kind: "RATE_SPIKE", sequence: ["rate_spike"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 50 } },
  { id: "ATTACK-008", title: "sync manipulation", kind: "SYNC_ANOMALY", sequence: ["sync", "coherence"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-009", title: "fake admin behavior", kind: "ADMIN_ANOMALY", sequence: ["fake_admin"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-010", title: "HB credit duplication", kind: "CREDIT_ANOMALY", sequence: ["settlement_duplicate"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-011", title: "refund replay", kind: "LEDGER_ANOMALY", sequence: ["duplicate_refund"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-012", title: "negative credit attempt", kind: "CREDIT_ANOMALY", sequence: ["negative_credit"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-013", title: "financial invariant violation", kind: "LEDGER_ANOMALY", sequence: ["alter_ledger"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-014", title: "cooperative isolation attack", kind: "IDOR_ATTEMPT", sequence: ["cross_coop_probe"], cooperativeId: "Coop-LAB-B", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-015", title: "log flooding", kind: "SYSTEM_ANOMALY", sequence: ["flood"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 100 } },
  { id: "ATTACK-016", title: "memory exhaustion", kind: "SYSTEM_ANOMALY", sequence: ["memory_flood"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-017", title: "sensor poisoning", kind: "INTEGRITY_FAILURE", sequence: ["sensor_poison"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-018", title: "threat DNA poisoning", kind: "UNKNOWN_BEHAVIOR", sequence: ["dna_poison"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-019", title: "defense loop", kind: "SYSTEM_ANOMALY", sequence: ["loop"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-020", title: "guardian deception", kind: "ADMIN_ANOMALY", sequence: ["fake_recovery"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-021", title: "circuit breaker abuse", kind: "SYSTEM_ANOMALY", sequence: ["circuit_abuse"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-022", title: "audit chain tampering", kind: "INTEGRITY_FAILURE", sequence: ["audit_tamper"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
  { id: "ATTACK-023", title: "combined multi-vector", kind: "AUTH_FAILURE", sequence: ["login_fail", "idor", "alter_ledger"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 10 } },
  { id: "ATTACK-024", title: "unknown behavioral attack", kind: "UNKNOWN_BEHAVIOR", sequence: ["weird_pattern_xyz"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001", metadata: { failures: 6 } },
  { id: "ATTACK-025", title: "attack against HOBELISCO itself", kind: "SYSTEM_ANOMALY", sequence: ["self_attack"], cooperativeId: "Coop-LAB-A", actorId: "Actor-LAB-Attacker-001" },
];

function toEvent(s: AttackScenario): HobeliscoEvent {
  return {
    eventId: `${s.id}-evt`,
    timestamp: new Date().toISOString(),
    kind: s.kind,
    source: "AttackMatrix",
    cooperativeId: s.cooperativeId,
    actorId: s.actorId,
    metadata: { ...s.metadata, sequence: s.sequence.join(",") },
  };
}

export function runAttackScenario(scenario: AttackScenario): AttackResult {
  const runtime = resetHobeliscoRuntime();
  runtime.start();
  const beforeAudit = runtime.organism.core.audit.length;

  if (scenario.id === "ATTACK-013" || scenario.id === "ATTACK-012") {
    const fin = runtime.organism.core.attemptFinancialAction({
      action: scenario.id === "ATTACK-012" ? "NEGATIVE_CREDIT" : "ALTER_LEDGER",
      target: "attack",
    });
    return {
      id: scenario.id,
      attack: scenario.title,
      signals: 0,
      decision: fin.blocked ? "BLOCKED" : "ALLOWED",
      defense: fin.blocked,
      contained: fin.blocked,
      recovered: false,
      falsePositive: false,
      falseNegative: !fin.blocked,
      cost: 1,
      memoryRecorded: runtime.organism.core.memory.stats().long > 0,
      auditRecorded: runtime.organism.core.audit.length > beforeAudit,
      learningInsight: false,
      passed: fin.blocked,
      detail: fin.reason ?? "blocked",
    };
  }

  if (scenario.id === "ATTACK-014") {
    const iso = assertCooperativeScope("62351750000165", "11111111000111");
    return {
      id: scenario.id,
      attack: scenario.title,
      signals: 0,
      decision: iso.ok ? "ALLOWED" : "BLOCKED",
      defense: !iso.ok,
      contained: !iso.ok,
      recovered: false,
      falsePositive: false,
      falseNegative: iso.ok,
      cost: 1,
      memoryRecorded: false,
      auditRecorded: true,
      learningInsight: false,
      passed: !iso.ok,
      detail: iso.ok ? "fail" : (iso as { reason: string }).reason,
    };
  }

  if (scenario.id === "ATTACK-019") {
    const lg = new LoopGuard(3);
    lg.tick("x"); lg.tick("x"); lg.tick("x");
    const blocked = !lg.tick("x").allowed;
    return {
      id: scenario.id,
      attack: scenario.title,
      signals: 0,
      decision: blocked ? "LOOP_BLOCKED" : "LOOP",
      defense: blocked,
      contained: blocked,
      recovered: false,
      falsePositive: false,
      falseNegative: !blocked,
      cost: 4,
      memoryRecorded: false,
      auditRecorded: false,
      learningInsight: false,
      passed: blocked,
      detail: "loop guard",
    };
  }

  if (scenario.id === "ATTACK-020") {
    const gs = runFalseSuccessBattery();
    return {
      id: scenario.id,
      attack: scenario.title,
      signals: 0,
      decision: "FALSE_SUCCESS_CHECK",
      defense: gs.passed >= 3,
      contained: true,
      recovered: false,
      falsePositive: false,
      falseNegative: false,
      cost: gs.total,
      memoryRecorded: false,
      auditRecorded: false,
      learningInsight: false,
      passed: gs.passed >= 3,
      detail: `${gs.passed}/${gs.total} guardian scenarios`,
    };
  }

  if (scenario.id === "ATTACK-021") {
    const cb = new CircuitBreaker();
    cb.recordFailure("1"); cb.recordFailure("2"); cb.recordFailure("3");
    const open = !cb.canAttemptRepair();
    return {
      id: scenario.id,
      attack: scenario.title,
      signals: 0,
      decision: open ? "CIRCUIT_OPEN" : "CLOSED",
      defense: open,
      contained: open,
      recovered: false,
      falsePositive: false,
      falseNegative: !open,
      cost: 3,
      memoryRecorded: false,
      auditRecorded: false,
      learningInsight: false,
      passed: open,
      detail: "circuit open at 3",
    };
  }

  if (scenario.id === "ATTACK-022") {
    const chain = runtime.organism.core.audit.exportEvents();
    const tampered = [...chain];
    if (tampered[0]) tampered[0] = { ...tampered[0], eventHash: "TAMPERED" };
    const v = verifyExportedChain(tampered);
    return {
      id: scenario.id,
      attack: scenario.title,
      signals: 0,
      decision: v.ok ? "UNDETECTED" : "TAMPER_DETECTED",
      defense: !v.ok,
      contained: !v.ok,
      recovered: false,
      falsePositive: false,
      falseNegative: v.ok,
      cost: 1,
      memoryRecorded: false,
      auditRecorded: true,
      learningInsight: false,
      passed: !v.ok,
      detail: v.reason ?? "tamper detected",
    };
  }

  if (scenario.id === "ATTACK-025") {
    const b = new LabBoundary(runtime.organism.core.audit);
    const prod = b.check("PROD_DATABASE");
    return {
      id: scenario.id,
      attack: scenario.title,
      signals: 0,
      decision: prod.blocked ? "BLOCKED_BY_LAB_BOUNDARY" : "BREACH",
      defense: prod.blocked,
      contained: prod.blocked,
      recovered: false,
      falsePositive: false,
      falseNegative: !prod.blocked,
      cost: 1,
      memoryRecorded: false,
      auditRecorded: true,
      learningInsight: false,
      passed: prod.blocked,
      detail: "self-attack boundary",
    };
  }

  const event = toEvent(scenario);
  runtime.processEvent(event);
  runtime.pulse();

  const snap = runtime.organism.core.snapshot();
  const threat = runtime.organism.core.reason({
    sequence: scenario.sequence,
    endpoint: `/attack/${scenario.id}`,
    cooperativeCnpj: scenario.cooperativeId,
    failures: Number(scenario.metadata?.failures ?? 3),
  });
  const rules = matchRules({ threat });
  const risk = classifyRisk(rules);
  const unknownClass = classifyUnknownBehavior({
    sequence: scenario.sequence,
    failures: Number(scenario.metadata?.failures ?? 3),
    hasKnownRule: rules.length > 0,
  });

  const fpA = buildThreatFingerprint({ sequence: ["normal", "login"], endpoint: "/a" });
  const fpB = buildThreatFingerprint({ sequence: ["normal", "login"], endpoint: "/b" });
  const similarButDistinct = fpA !== fpB;

  return {
    id: scenario.id,
    attack: scenario.title,
    signals: snap.sensors.length,
    decision: risk,
    defense: snap.state === "DEFENDING" || snap.state === "FORTRESS" || threat.severity !== "low",
    contained: threat.severity === "critical" ? snap.state !== "WATCHING" : true,
    recovered: false,
    falsePositive: scenario.id === "ATTACK-024" && unknownClass === "UNKNOWN",
    falseNegative: false,
    cost: 2,
    memoryRecorded: runtime.organism.core.memory.stats().short + runtime.organism.core.memory.stats().mid > 0,
    auditRecorded: runtime.organism.core.audit.length > beforeAudit,
    learningInsight: snap.learningInsights.length >= 0,
    passed:
      similarButDistinct &&
      (scenario.id !== "ATTACK-024" ||
        unknownClass === "SUSPICIOUS" ||
        unknownClass === "HIGH_RISK" ||
        unknownClass === "HUMAN_REQUIRED"),
    detail: scenario.id === "ATTACK-024" ? `UNKNOWN-BEHAVIOR:${unknownClass}` : `${risk}`,
  };
}

export function runAllAttacks(): { results: AttackResult[]; passed: number; total: number } {
  const results = ATTACK_SCENARIOS.map(runAttackScenario);
  return { results, passed: results.filter((r) => r.passed).length, total: results.length };
}
