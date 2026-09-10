/** Fail-closed e chaos — testes controlados LAB */

import { HobeliscoSimulationEngine } from "./HobeliscoSimulationEngine";
import { generateScenarios } from "./ScenarioGenerator";
import { ActiveDefenseExecutor } from "./ActiveDefenseExecutor";
import { assertSimulationAllowed, loadSimulationSafetyConfig } from "./SimulationSafety";
import { resetHobeliscoRuntime } from "../runtime/HobeliscoRuntime";
import { resetOrganismIdentity } from "../organism/OrganismIdentity";
import { resetLabWorld } from "../lab-world/LabWorld";

export interface LabSafetyTestResult {
  id: string;
  pass: boolean;
  detail: string;
}

export function runFailClosedTests(): LabSafetyTestResult[] {
  const results: LabSafetyTestResult[] = [];

  process.env.HOBELISCO_ENVIRONMENT = "PRODUCTION";
  const prod = loadSimulationSafetyConfig();
  const prodBlock = assertSimulationAllowed(prod);
  results.push({
    id: "FC_production_simulation",
    pass: !prodBlock.ok,
    detail: prodBlock.ok ? "FAIL: prod allowed" : prodBlock.reason,
  });
  process.env.HOBELISCO_ENVIRONMENT = "LAB";

  const noSandbox = loadSimulationSafetyConfig();
  const blocked = assertSimulationAllowed({ ...noSandbox, sandbox: false });
  results.push({
    id: "FC_sandbox_required",
    pass: !blocked.ok,
    detail: blocked.ok ? "FAIL" : blocked.reason,
  });

  const executor = new ActiveDefenseExecutor();
  const prodDef = executor.execute("REJECT", { target: "/api", family: "T01_AUTH", environment: "PRODUCTION" });
  results.push({
    id: "FC_active_defense_prod",
    pass: !prodDef.executed,
    detail: prodDef.reason,
  });

  resetOrganismIdentity();
  resetLabWorld();
  const runtime = resetHobeliscoRuntime();
  runtime.start();
  const fin = runtime.organism.core.attemptFinancialAction({ action: "ALTER_BALANCE", target: "hb_credit_accounts" });
  results.push({
    id: "FC_financial_mutation_blocked",
    pass: fin.blocked,
    detail: fin.reason ?? "blocked",
  });

  return results;
}

import { getLearningEngine } from "./HobeliscoLearningEngine";

export function runChaosSecurityTests(): LabSafetyTestResult[] {
  const results: LabSafetyTestResult[] = [];
  const engine = new HobeliscoSimulationEngine();

  const base = generateScenarios({ count: 5, seed: 99, campaignId: "CHAOS", mode: "CHAOS" });
  let errors = 0;
  for (const sc of base) {
    sc.defenseState = "degraded";
    const r = engine.executeScenario(sc);
    if (r.outcome === "ERROR") errors += 1;
  }
  results.push({
    id: "CHAOS_degraded_defense",
    pass: errors === 0,
    detail: `executed=${base.length} errors=${errors}`,
  });

  const learning = getLearningEngine();
  learning.reset();
  const c = learning.propose({
    id: "chaos_learn",
    sourceIncidentIds: [],
    sourceScenarioIds: [],
    attackFamily: "T01_AUTH",
    observedPattern: "chaos",
    proposedDefense: "test",
    expectedBenefit: "test",
    falsePositiveRisk: "LOW",
    confidence: 0.9,
    createdAt: new Date().toISOString(),
    status: "PROPOSED",
  });
  const directDeploy = learning.transition(c.id, "DEPLOYED");
  results.push({
    id: "CHAOS_learning_isolation",
    pass: directDeploy === null,
    detail: "auto-deploy blocked",
  });

  return results;
}
