import { performance } from "perf_hooks";
import type { CampaignMode, CampaignReport, GeneratedScenario, ScenarioExecutionResult } from "./types";
import { generateScenarios, GENERATOR_VERSION } from "./ScenarioGenerator";
import { HobeliscoSimulationEngine } from "./HobeliscoSimulationEngine";
import { getKnowledgeVersion } from "./ThreatKnowledgeBase";
import { DEFAULT_POLICY_VERSION } from "./DefensePolicyStore";
import { proposeLearningFromGap } from "./DefensePolicyLab";
import { getLearningEngine } from "./HobeliscoLearningEngine";
import { assertSimulationAllowed, generateCampaignId, loadSimulationSafetyConfig } from "./SimulationSafety";
import { computeCoverageMetrics } from "./CoverageMetrics";
import { getThreatMemory } from "./ThreatMemory";
import { injectLegitimateScenarios } from "./FalsePositiveLab";
import { loadFabricMode } from "../security-fabric/HobeliscoSecurityFabric";

export interface CampaignOptions {
  count?: number;
  seed?: number;
  mode?: CampaignMode;
}

export function runAdaptiveDefenseCampaign(options: CampaignOptions = {}): CampaignReport {
  const start = performance.now();
  const count = options.count ?? 10_000;
  const seed = options.seed ?? 20260909;
  const mode = options.mode ?? "FULL";
  const campaignId = generateCampaignId();
  const safety = loadSimulationSafetyConfig();

  const safetyCheck = assertSimulationAllowed(safety);
  if (!safetyCheck.ok) {
    return emptyReport(campaignId, seed, count, safetyCheck.reason, start);
  }

  const scenarios = injectLegitimateScenarios(
    generateScenarios({ count, seed, campaignId, mode }),
    seed,
    mode === "FULL" || mode === "NIGHTLY" ? 0.2 : 0.12
  );
  const engine = new HobeliscoSimulationEngine(loadFabricMode());
  const memory = getThreatMemory();
  memory.reset();
  const results: ScenarioExecutionResult[] = [];

  let blocked = 0;
  let detectedOnly = 0;
  let missed = 0;
  let falsePositive = 0;
  let inconclusive = 0;
  let errors = 0;
  const coverage: CampaignReport["coverage"] = {};

  for (const scenario of scenarios) {
    if (results.length >= safety.maxRequests) break;
    if (count >= 20_000 && results.length > 0 && results.length % 10_000 === 0) {
      console.log(`  … ${results.length}/${scenarios.length} scenarios`);
    }
    const result = engine.executeScenario(scenario);
    results.push(result);
    memory.record({ scenarioId: scenario.scenarioId, family: scenario.family, sequence: scenario.sequence, result });

    if (!coverage[scenario.family]) {
      coverage[scenario.family] = { total: 0, blocked: 0, detected: 0, missed: 0, fp: 0 };
    }
    coverage[scenario.family].total += 1;

    switch (result.outcome) {
      case "BLOCKED":
        blocked += 1;
        coverage[scenario.family].blocked += 1;
        break;
      case "DETECTED_ONLY":
        detectedOnly += 1;
        coverage[scenario.family].detected += 1;
        break;
      case "MISSED":
        missed += 1;
        coverage[scenario.family].missed += 1;
        break;
      case "FALSE_POSITIVE":
        falsePositive += 1;
        coverage[scenario.family].fp += 1;
        break;
      case "INCONCLUSIVE":
        inconclusive += 1;
        break;
      case "ERROR":
        errors += 1;
        break;
    }
  }

  const metrics = computeCoverageMetrics(results, coverage);
  const applicable = count - inconclusive - errors;

  const gaps = Object.entries(coverage)
    .filter(([, v]) => v.missed > v.blocked)
    .map(([family, v]) => `${family}: missed=${v.missed} blocked=${v.blocked}`);

  const learningEngine = getLearningEngine();
  const candidates = proposeLearningFromGap(
    results.filter((r) => r.outcome === "MISSED"),
    scenarios
  );
  for (const c of candidates) learningEngine.propose(c);

  const financialMutations = engine.getFinancialMutations();
  let status: CampaignReport["status"] = "GREEN";
  if (financialMutations > 0) status = "RED";
  else if (missed > count * 0.05 || metrics.falsePositiveRate > 20) status = "YELLOW";
  else if (metrics.defenseCoverageScore < 70) status = "YELLOW";

  return {
    campaignId,
    mode: "LAB-HARDENED-ADAPTIVE",
    scenariosGenerated: scenarios.length,
    scenariosExecuted: results.length,
    blocked,
    detectedOnly,
    missed,
    falsePositive,
    inconclusive,
    errors,
    coverage,
    gaps,
    learningCandidates: learningEngine.list("PROPOSED"),
    policyVersion: DEFAULT_POLICY_VERSION,
    threatKnowledgeVersion: getKnowledgeVersion(),
    generatorVersion: GENERATOR_VERSION,
    seed,
    financialMutations,
    externalTargets: 0,
    defenseCoverageScore: metrics.defenseCoverageScore,
    preventionRate: metrics.preventionRate,
    detectionRate: metrics.detectionRate,
    falsePositiveRate: metrics.falsePositiveRate,
    status,
    executedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - start),
  };
}

function emptyReport(campaignId: string, seed: number, count: number, reason: string, start: number): CampaignReport {
  return {
    campaignId,
    mode: "LAB-HARDENED-ADAPTIVE",
    scenariosGenerated: 0,
    scenariosExecuted: 0,
    blocked: 0,
    detectedOnly: 0,
    missed: 0,
    falsePositive: 0,
    inconclusive: 0,
    errors: 1,
    coverage: {},
    gaps: [reason],
    learningCandidates: [],
    policyVersion: DEFAULT_POLICY_VERSION,
    threatKnowledgeVersion: getKnowledgeVersion(),
    generatorVersion: GENERATOR_VERSION,
    seed,
    financialMutations: 0,
    externalTargets: 0,
    defenseCoverageScore: 0,
    preventionRate: 0,
    detectionRate: 0,
    falsePositiveRate: 0,
    status: "RED",
    executedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - start),
  };
}
