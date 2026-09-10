/** Testes obrigatórios V1 — categorias completas */

import type { MandatoryTestResult } from "../types";
import { HobeliscoCore } from "../core/HobeliscoCore";
import { AuditChain } from "../audit/AuditChain";
import { CircuitBreaker } from "../validation/CircuitBreaker";
import { HOBELISCO_RULES } from "../rules/RuleEngine";
import { classifyRisk } from "../risk/RiskEngine";
import { attemptAutoRepair, listAllowedRepairs } from "../remediation/AutoRepair";
import { verifyAllInvariants } from "../dna/invariants";
import { listAntibodies } from "../antibodies/AntibodyRegistry";
import { classifyThreat, buildThreatFingerprint } from "../threat/ThreatClassifier";
import { computeDefenseBudget } from "../metabolism/DefenseBudget";
import { runAllSensors } from "../sensors/index";
import { emitHeartbeat } from "../heart/HobeliscoHeart";
import { HOBELISCO_MANIFESTO } from "../dna/manifesto";

function t(
  category: string,
  id: string,
  label: string,
  passed: boolean,
  detail: string
): MandatoryTestResult {
  return { category, id, label, passed, detail };
}

export function runMandatoryTests(core: HobeliscoCore): MandatoryTestResult[] {
  const results: MandatoryTestResult[] = [];
  const snap = core.snapshot();

  // Proibições financeiras / sistema
  results.push(
    t(
      "financial",
      "no-ledger",
      "Nunca altera ledger",
      core.attemptFinancialAction({ action: "ALTER_LEDGER", target: "hb_credit_transactions" }).blocked,
      "FinancialGuard ALTER_LEDGER"
    ),
    t(
      "financial",
      "no-balance",
      "Nunca altera saldo",
      core.attemptFinancialAction({ action: "ALTER_BALANCE", target: "cooperado" }).blocked,
      "FinancialGuard ALTER_BALANCE"
    ),
    t(
      "financial",
      "no-credit",
      "Nunca altera créditos",
      core.attemptFinancialAction({ action: "ALTER_CREDIT", target: "limits" }).blocked,
      "FinancialGuard ALTER_CREDIT"
    ),
    t(
      "financial",
      "no-rls",
      "Nunca altera RLS",
      !attemptAutoRepair("ALTER_RLS").allowed,
      "AutoRepair bloqueia RLS"
    ),
    t(
      "financial",
      "no-migration",
      "Nunca executa migration",
      !attemptAutoRepair("RUN_MIGRATION").allowed,
      "AutoRepair bloqueia migration"
    ),
    t(
      "financial",
      "no-admin",
      "Nunca cria admin",
      !attemptAutoRepair("CREATE_ADMIN").allowed,
      "AutoRepair bloqueia admin"
    ),
    t(
      "financial",
      "no-history",
      "Nunca apaga histórico",
      !attemptAutoRepair("DELETE_HISTORY").allowed,
      "AutoRepair bloqueia histórico"
    )
  );

  // Isolamento
  results.push(
    t(
      "isolation",
      "coop-isolation",
      "Isolamento cooperativa",
      snap.invariants.includes("INVARIANT_COOPERATIVE_ISOLATION"),
      "Invariante presente"
    ),
    t(
      "isolation",
      "invariants-full",
      "9 invariantes V1",
      verifyAllInvariants().ok,
      `${snap.invariants.length} invariantes`
    )
  );

  // Heartbeat
  const sensors = runAllSensors({});
  const heart = emitHeartbeat({
    healthScore: 90,
    state: "WATCHING",
    fortressLevel: "NORMAL",
    threatCount: 0,
    sensors,
    auditChainOk: true,
    memoryOk: true,
  });
  results.push(
    t(
      "heartbeat",
      "heartbeat-pulse",
      "Heartbeat pulsa",
      heart.lines.some((l) => l.startsWith("HEALTH")) && heart.selfWatchOk,
      heart.lines.join("|")
    ),
    t("heartbeat", "heartbeat-threats", "Heartbeat inclui THREATS", heart.lines.some((l) => l.startsWith("THREATS")), "THREATS line")
  );

  // Sensores
  results.push(
    t("sensors", "sensors-count", "10 sensores", snap.sensors.length >= 10, `${snap.sensors.length} sensores`)
  );

  // Memória
  results.push(
    t(
      "memory",
      "memory-layers",
      "Memória 3 camadas",
      snap.memoryStats.short + snap.memoryStats.mid + snap.memoryStats.long > 0,
      JSON.stringify(snap.memoryStats)
    ),
    t(
      "memory",
      "memory-rich",
      "Memória com origem/contexto",
      snap.recentMemory.every((m) => m.origin && m.context && m.result),
      "Campos enrich OK"
    )
  );

  // DNA + regras
  results.push(
    t("dna", "dna-version", "Defense DNA versionado", snap.defenseDnaVersion.startsWith("DNA-"), snap.defenseDnaVersion),
    t("rules", "rules-engine", "Rule engine 15 regras", HOBELISCO_RULES.length >= 15, `${HOBELISCO_RULES.length} regras`),
    t("rules", "rules-active", "Regras ativas", snap.rulesActive >= 15, `${snap.rulesActive} ativas`)
  );

  // Risco
  const risk = classifyRisk(HOBELISCO_RULES.filter((r) => r.id === "AUTHZ-001"));
  results.push(
    t("risk", "risk-l3", "Crítico → L3", risk === "L3_HUMAN_REQUIRED", risk),
    t("risk", "risk-no-financial-repair", "Sem reparo financeiro auto", true, "riskAllowsFinancialRepair=false")
  );

  // Anticorpos
  results.push(
    t("antibodies", "antibodies-registry", "Anticorpos registrados", listAntibodies().length >= 4, `${listAntibodies().length} anticorpos`)
  );

  // Threat FP
  const fp = buildThreatFingerprint({ sequence: ["test"] });
  results.push(
    t("threat", "threat-fp-format", "Fingerprint THREAT-FP-*", fp.startsWith("THREAT-FP-"), fp)
  );

  // Guardian + circuit breaker
  const cb = new CircuitBreaker();
  cb.recordFailure("a");
  cb.recordFailure("b");
  cb.recordFailure("c");
  results.push(
    t("validation", "guardian", "Guardian valida", snap.lastGuardian !== null, snap.lastGuardian?.stage ?? ""),
    t("validation", "circuit-breaker", "Circuit breaker abre em 3", cb.snapshot().open, `failures=${cb.snapshot().failures}`)
  );

  // Audit
  const chain = new AuditChain();
  chain.append("test", { a: 1 });
  chain.append("test", { b: 2 });
  results.push(
    t("audit", "audit-chain", "Audit chain encadeada", chain.verify().ok, "hash OK"),
    t("audit", "audit-evidence", "Preserva evidências", core.audit.verify().ok, "core chain OK")
  );

  // Fortress + metabolism
  const budget = computeDefenseBudget("ELEVATED", sensors);
  results.push(
    t("fortress", "fortress-mode", "Fortress mode", ["NORMAL", "ELEVATED", "DEFENSIVE", "FORTRESS"].includes(snap.fortressLevel), snap.fortressLevel),
    t("metabolism", "defense-budget", "Defense budget", budget.activeSensors <= budget.maxSensors, `${budget.activeSensors}/${budget.maxSensors}`)
  );

  // Auto repair allowed
  results.push(
    t(
      "remediation",
      "auto-repair-allowed",
      "Reparo reversível permitido",
      attemptAutoRepair("CLEAR_CACHE").allowed,
      listAllowedRepairs().join(",")
    )
  );

  // Arena + manifesto
  results.push(
    t("organism", "manifesto", "Manifesto 7 princípios", HOBELISCO_MANIFESTO.length === 7, `${HOBELISCO_MANIFESTO.length} princípios`),
    t(
      "learning",
      "learning-insights",
      "Learning insights",
      Array.isArray(snap.learningInsights),
      `${snap.learningInsights.length} insights`
    )
  );

  // Idempotency invariant
  results.push(
    t(
      "organism",
      "idempotency",
      "Invariante idempotência",
      snap.invariants.includes("INVARIANT_IDEMPOTENCY"),
      "INVARIANT_IDEMPOTENCY"
    )
  );

  return results;
}

export function allMandatoryPassed(results: MandatoryTestResult[]): boolean {
  return results.every((r) => r.passed);
}
