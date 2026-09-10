import type { FullOrganismAuditReport } from "./types";

export function formatFullAuditText(report: FullOrganismAuditReport): string {
  const lines: string[] = [
    "═══════════════════════════════════════════",
    " HOBELISCO HX — FULL ORGANISM AUDIT (LAB)",
    "═══════════════════════════════════════════",
    `Verdict: ${report.organismVerdict}`,
    `Readiness: ${report.organismReadinessScore}/100`,
    `Organism: ${report.organismId}`,
    `DNA: ${report.dna} | Gen: ${report.generation}`,
    `State: ${report.vitalState} | Health: ${report.health}`,
    `Tests: ${report.passed}/${report.totalTests} PASS`,
    `V1 Life: ${report.lifeAuditRegression.passed}/${report.lifeAuditRegression.total} (${report.lifeAuditRegression.ok ? "OK" : "REGRESSION"})`,
    `Arena: ${report.arenaRegression.scenariosPassed}/${report.arenaRegression.scenariosRun}`,
    `Full Core Sims: ${report.fullCoreSimulations.passed}/${report.fullCoreSimulations.total} (${report.fullCoreSimulations.survivalRate}% survival)`,
    `10000 sims: ${report.fullCoreSimulations.notExecuted10000 ? "NOT_EXECUTED" : "EXECUTED"}`,
    "",
    "── Tests ──",
  ];

  for (const t of report.tests) {
    lines.push(`- [${t.status}] **${t.id}** — ${t.name}: ${t.detail}`);
  }

  lines.push("", "── Metrics ──");
  lines.push(`Survival: ${report.metrics.survivalRate}%`);
  lines.push(`Containment: ${report.metrics.containmentRate}%`);
  lines.push(`Recovery: ${report.metrics.recoveryRate}%`);
  lines.push(`FP: ${report.metrics.falsePositiveRate}% | FN: ${report.metrics.falseNegativeRate}%`);

  lines.push("", "── Boundaries ──");
  lines.push(`Production blocked: ${report.boundaries.productionBlocked}`);
  lines.push(`Financial violations: ${report.boundaries.financialViolations}`);

  if (report.gaps.length) {
    lines.push("", "── Gaps ──");
    for (const g of report.gaps) lines.push(`- ${g}`);
  }

  lines.push("", "── Limitations ──");
  for (const l of report.limitations) lines.push(`- ${l}`);

  return lines.join("\n");
}

export function formatFullAuditMarkdown(report: FullOrganismAuditReport): string {
  return `# HOBELISCO LAB Full Organism Audit\n\n\`\`\`\n${formatFullAuditText(report)}\n\`\`\`\n`;
}
