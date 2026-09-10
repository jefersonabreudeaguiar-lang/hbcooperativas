#!/usr/bin/env npx tsx
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { runClosureAudit } from "@lab/hobelisco-hx/closure-audit/runClosureAudit";

process.env.HOBELISCO_ENVIRONMENT = "LAB";
process.env.HB_HOBELISCO_LAB_ENABLED = "true";

const report = runClosureAudit();
const ts = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
const dir = join(process.cwd(), "lab", "hobelisco-hx", "reports");
const docsDir = join(process.cwd(), "docs");
mkdirSync(dir, { recursive: true });

const jsonPath = join(dir, `hobelisco-closure-final-${ts}.json`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

const text = formatClosureReport(report);
writeFileSync(join(dir, `hobelisco-closure-final-${ts}.txt`), text, "utf8");
writeFileSync(join(docsDir, "HOBELISCO-CLOSURE-AUDIT.md"), `# HOBELISCO Closure Audit\n\n\`\`\`\n${text}\n\`\`\`\n`, "utf8");

console.log(text);
console.log(`\nRelatório: ${jsonPath}`);
process.exit(report.organismVerdict === "ORGANISM-RED" ? 1 : 0);

function formatClosureReport(r: ReturnType<typeof runClosureAudit>): string {
  const lines = [
    "══════════════════════════════════════════════",
    " HOBELISCO HX — CLOSURE REPORT",
    ` Version: ${r.version}`,
    "══════════════════════════════════════════════",
    `STATUS: ${r.organismVerdict}`,
    `Organism: ${r.organismId}`,
    `Life State: ${r.lifeState}`,
    `Vitality: ${r.vitality}/100`,
    `Immunity: ${r.immunityReadiness.score}/100 (${r.immunityReadiness.classification})`,
    `Tests: ${r.passed}/${r.totalTests}`,
    `V1 Life: ${r.v1Regression.life}`,
    `V1 Arena: ${r.v1Regression.arena}`,
    `Arena Full Core: ${r.arena.fullCorePassed}/${r.arena.fullCore}`,
    `10000 sims: ${r.arena.notExecuted10000 ? "NOT_EXECUTED" : "EXECUTED"}`,
    `Attacks: ${r.attacks.passed}/${r.attacks.total}`,
    `Production Violations: ${r.productionBoundary.violations}`,
    "",
    "── Capabilities ──",
    `THREAT DNA: ${r.threatDNA.pass ? "PASS" : "FAIL"}`,
    `MEMORY: ${r.memory.pass ? "PASS" : "FAIL"}`,
    `ANTIBODIES: ${r.antibodies.pass ? "PASS" : "FAIL"}`,
    `EVOLUTION: ${r.evolution.pass ? "PASS" : "FAIL"}`,
    `GUARDIAN: ${r.guardian.pass ? "PASS" : "FAIL"} (${r.guardian.falseSuccessScenarios} scenarios)`,
    `CIRCUIT BREAKER: ${r.circuitBreaker.pass ? "PASS" : "FAIL"}`,
    `FINANCIAL BARRIER: ${r.financialBoundary.pass ? "PASS" : "FAIL"} (${r.financialBoundary.blocked} blocked)`,
    `COOPERATIVE ISOLATION: ${r.cooperativeIsolation.pass ? "PASS" : "FAIL"}`,
    `REPLAY: ${r.replay.pass ? "PASS" : "FAIL"}`,
    `SNAPSHOT: ${r.snapshot.pass ? "PASS" : "FAIL"}`,
    `DEATH/REINCARNATION: ${r.deathReincarnation.pass ? "PASS" : "FAIL"}`,
    `HIBERNATION: ${r.hibernation.pass ? "PASS" : "FAIL"}`,
    `ORGAN RESTART: ${r.organRestart ? "PASS" : "FAIL"}`,
    `RED TEAM: ${r.redTeam.pass ? "PASS" : "FAIL"}`,
    `LOOP GUARD: ${r.loopGuard.pass ? "PASS" : "FAIL"}`,
    `SECURITY SCAN: ${r.securityScan.pass ? "PASS" : "FAIL"}`,
    "",
    "── Tests ──",
  ];
  for (const t of r.tests) lines.push(`[${t.status}] ${t.id} — ${t.name}: ${t.detail}`);
  if (r.remainingGaps.length) {
    lines.push("", "── Gaps ──");
    for (const g of r.remainingGaps) lines.push(`- ${g}`);
  }
  return lines.join("\n");
}
