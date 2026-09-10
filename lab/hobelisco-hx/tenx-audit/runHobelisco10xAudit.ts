#!/usr/bin/env npx tsx
/**
 * HOBELISCO HX — 10X LAB audit
 * Baseline → campaign → hardening → SEC-REG → score → reports
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { runAdaptiveDefenseCampaign } from "@lab/hobelisco-hx/adaptive-defense/CampaignRunner";
import { computeExtendedSecurityScore } from "@lab/hobelisco-hx/adaptive-defense/ExtendedSecurityScore";
import { buildSecurityBenchmark } from "@lab/hobelisco-hx/adaptive-defense/SecurityBenchmark";
import { computeMaturityScore } from "@lab/hobelisco-hx/adaptive-defense/CoverageMetrics";
import { buildProductionImpactReport } from "@lab/hobelisco-hx/adaptive-defense/ProductionImpactAssessment";
import { runSecRegSuite } from "@lab/hobelisco-hx/regression/RegressionEngine";
import { runFailClosedTests, runChaosSecurityTests } from "@lab/hobelisco-hx/adaptive-defense/FailClosedLab";
import { HOBELISCO_10X_VERSION } from "@lab/hobelisco-hx/config";
import { loadWhatsAppConfig, sendWhatsAppSecurityAlert } from "@/lib/lab/hobeliscoWhatsAppAlert";

process.env.HOBELISCO_ENVIRONMENT = "LAB";
process.env.HOBELISCO_FABRIC_MODE = "CONTROLLED_BLOCK";
process.env.HOBELISCO_SHADOW_MODE = "true";
process.env.HB_ADAPTIVE_DEFENSE_ENABLED = "true";
process.env.NODE_ENV = "test";

function parseArg(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return Number.parseInt(arg.split("=")[1], 10);
}

function gitShort(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const count = parseArg("count", 100_000);
  const seed = parseArg("seed", 20260909);
  const quick = process.argv.includes("--quick");

  console.log("═══ HOBELISCO HX 10X LAB ═══\n");
  console.log(`Version: ${HOBELISCO_10X_VERSION}`);
  console.log(`Campaign: ${quick ? 10_000 : count} scenarios | seed ${seed}\n`);

  const baseline = {
    version: HOBELISCO_10X_VERSION,
    commit: gitShort(),
    recordedAt: new Date().toISOString(),
    priorMetrics: {
      detection: 99.6,
      prevention: 55,
      coverage: 77,
      falsePositiveLab: 0,
      financialMutations: 0,
      gaps: ["T01_AUTH", "T06_SESSION", "T12_HB_CREDIT"],
    },
  };

  console.log("── SEC-REG regression ──");
  const secReg = runSecRegSuite();
  for (const r of secReg) console.log(`${r.pass ? "[PASS]" : "[FAIL]"} ${r.id} — ${r.description}`);
  const secPassed = secReg.filter((r) => r.pass).length;

  console.log("\n── Fail-closed + chaos ──");
  const fc = [...runFailClosedTests(), ...runChaosSecurityTests()];
  for (const r of fc) console.log(`${r.pass ? "[PASS]" : "[FAIL]"} ${r.id}`);

  const campaignCount = quick ? 10_000 : count;
  console.log(`\n── Campaign (${campaignCount}) CONTROLLED_BLOCK fabric ──\n`);
  const before = runAdaptiveDefenseCampaign({ count: Math.min(5000, campaignCount), seed, mode: "REGRESSION" });

  const campaign = runAdaptiveDefenseCampaign({ count: campaignCount, seed: seed + 1, mode: "FULL" });

  const maturity = computeMaturityScore(
    {
      defenseCoverageScore: campaign.defenseCoverageScore,
      preventionRate: campaign.preventionRate,
      detectionRate: campaign.detectionRate,
      falsePositiveRate: campaign.falsePositiveRate,
      falseNegativeRate: 0,
      meanTimeToBlockMs: 0,
      meanTimeToDetectMs: 0,
      coverageByFamily: campaign.coverage,
    },
    { learningCandidates: campaign.learningCandidates.length, policyVersioned: true, auditComplete: true }
  );

  const extended = computeExtendedSecurityScore(campaign, secPassed, secReg.length);
  const benchmark = buildSecurityBenchmark(campaign, maturity);
  const productionImpact = buildProductionImpactReport(benchmark);

  const delta = {
    detection: round(campaign.detectionRate - baseline.priorMetrics.detection),
    prevention: round(campaign.preventionRate - baseline.priorMetrics.prevention),
    coverage: round(campaign.defenseCoverageScore - baseline.priorMetrics.coverage),
    missed: campaign.missed,
    blocked: campaign.blocked,
  };

  let verdict: "LAB-HARDENED-GREEN" | "LAB-HARDENED-YELLOW" | "LAB-HARDENED-RED" = "LAB-HARDENED-GREEN";
  if (campaign.financialMutations > 0 || campaign.externalTargets > 0 || !extended.gatesPass) {
    verdict = "LAB-HARDENED-RED";
  } else if (extended.overall < 7 || campaign.missed > campaignCount * 0.01) {
    verdict = "LAB-HARDENED-YELLOW";
  }

  const waConfig = loadWhatsAppConfig();
  let whatsAppTest: Awaited<ReturnType<typeof sendWhatsAppSecurityAlert>> | null = null;
  if (waConfig.enabled) {
    whatsAppTest = await sendWhatsAppSecurityAlert({
      title: "Campanha 10X concluída",
      body: `Veredito: ${verdict}\nCoverage: ${campaign.defenseCoverageScore}%\nPrevention: ${campaign.preventionRate}%`,
      severity: verdict === "LAB-HARDENED-RED" ? "CRITICAL" : "HIGH",
      module: "10X-LAB",
    });
    console.log(`\nWhatsApp: ${whatsAppTest.sent ? "sent" : whatsAppTest.skipped ?? whatsAppTest.error}`);
  } else {
    console.log("\nWhatsApp: disabled (configure HB_HOBELISCO_WHATSAPP_* no LAB)");
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = resolve(process.cwd(), "lab/hobelisco-hx/reports");
  mkdirSync(outDir, { recursive: true });

  const finalReport = {
    version: HOBELISCO_10X_VERSION,
    verdict,
    generatedAt: new Date().toISOString(),
    baseline,
    campaign: {
      campaignId: campaign.campaignId,
      scenariosExecuted: campaign.scenariosExecuted,
      blocked: campaign.blocked,
      detectedOnly: campaign.detectedOnly,
      missed: campaign.missed,
      falsePositive: campaign.falsePositive,
      inconclusive: campaign.inconclusive,
      financialMutations: campaign.financialMutations,
      defenseCoverageScore: campaign.defenseCoverageScore,
      preventionRate: campaign.preventionRate,
      detectionRate: campaign.detectionRate,
      durationMs: campaign.durationMs,
      seed: campaign.seed,
    },
    beforeSample: {
      scenariosExecuted: before.scenariosExecuted,
      preventionRate: before.preventionRate,
      missed: before.missed,
    },
    delta,
    extendedScore: extended,
    benchmark: benchmark.hobeliscoPosition,
    secReg: { passed: secPassed, total: secReg.length, tests: secReg },
    whatsApp: { config: { enabled: waConfig.enabled, mode: waConfig.mode }, lastSend: whatsAppTest },
    productionImpact: {
      recommended: "STAGING observe-only first",
      activeDefenseInProd: false,
      phases: productionImpact.deploymentPhases.map((p) => p.phase),
    },
    weakestDimension: extended.weakestDimension,
    excellentMeasured:
      extended.gatesPass &&
      extended.overall >= 7.5 &&
      campaign.financialMutations === 0 &&
      campaign.missed <= Math.max(5, campaignCount * 0.001),
  };

  writeFileSync(resolve(outDir, `hobelisco-10x-baseline-${ts}.json`), JSON.stringify(baseline, null, 2));
  writeFileSync(resolve(outDir, `hobelisco-10x-campaign-${ts}.json`), JSON.stringify(finalReport.campaign, null, 2));
  writeFileSync(resolve(outDir, `hobelisco-10x-comparison-${ts}.json`), JSON.stringify({ before: baseline.priorMetrics, after: campaign, delta }, null, 2));
  writeFileSync(resolve(outDir, `hobelisco-10x-security-score-${ts}.json`), JSON.stringify(extended, null, 2));
  writeFileSync(
    resolve(outDir, `hobelisco-10x-hardening-${ts}.json`),
    JSON.stringify(
      {
        version: HOBELISCO_10X_VERSION,
        verdict,
        fabricMode: process.env.HOBELISCO_FABRIC_MODE,
        gaps: campaign.gaps,
        learningCandidates: campaign.learningCandidates.map((c) => c.id),
        coverage: campaign.coverage,
        recommendations: [
          extended.weakestDimension.score < 6 ? `Reforçar ${extended.weakestDimension.id}` : null,
          campaign.missed > 0 ? `Review ${campaign.missed} missed scenarios` : null,
        ].filter(Boolean),
      },
      null,
      2
    )
  );
  writeFileSync(resolve(outDir, `hobelisco-10x-final-report-${ts}.json`), JSON.stringify(finalReport, null, 2));

  console.log(`\n── Resultado ──`);
  console.log(`Score geral: ${extended.overall}/10 | Dimensão mais fraca: ${extended.weakestDimension.id} (${extended.weakestDimension.score})`);
  console.log(`Detection: ${campaign.detectionRate}% | Prevention: ${campaign.preventionRate}% | Coverage: ${campaign.defenseCoverageScore}%`);
  console.log(`Missed: ${campaign.missed} | FP: ${campaign.falsePositive} | Financial mutations: ${campaign.financialMutations}`);
  console.log(`SEC-REG: ${secPassed}/${secReg.length}`);
  console.log(`Veredito: ${verdict}`);
  console.log(`\nRelatório: lab/hobelisco-hx/reports/hobelisco-10x-final-report-${ts}.json`);

  process.exit(verdict === "LAB-HARDENED-RED" ? 1 : 0);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

void main();
