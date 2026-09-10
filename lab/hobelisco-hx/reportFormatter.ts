import type { ArenaReport } from "../types";

export function formatArenaReportText(report: ArenaReport): string {
  const lines: string[] = [
    "═══════════════════════════════════════",
    " HOBELISCO HX V1 — Arena Report (LAB)",
    "═══════════════════════════════════════",
    `Gerado: ${report.generatedAt}`,
    `Cenários: ${report.scenariosPassed}/${report.scenariosRun} OK`,
    `Micro-sims: ${report.microSimulationsPassed}/${report.microSimulations}`,
    `Testes obrigatórios: ${report.allMandatoryPassed ? "TODOS PASS" : "FALHAS"}`,
    "",
    "── Snapshot ──",
    `Versão: ${report.snapshot.version}`,
    `Estado: ${report.snapshot.state}`,
    `Saúde: ${report.snapshot.health.overall}/100`,
    `Fortress: ${report.snapshot.fortressLevel}`,
    `Risco: ${report.snapshot.riskLevel}`,
    `DNA: ${report.snapshot.defenseDnaVersion}`,
    `Regras ativas: ${report.snapshot.rulesActive}`,
    "",
    "── Testes por categoria ──",
  ];

  const byCat = new Map<string, typeof report.mandatoryTests>();
  for (const test of report.mandatoryTests) {
    const list = byCat.get(test.category) ?? [];
    list.push(test);
    byCat.set(test.category, list);
  }

  for (const [cat, tests] of byCat) {
    lines.push(`[${cat}]`);
    for (const t of tests) {
      lines.push(`  [${t.passed ? "PASS" : "FAIL"}] ${t.label}`);
    }
  }

  if (report.notes.length) {
    lines.push("", "── Notas ──");
    for (const n of report.notes) lines.push(`  • ${n}`);
  }

  lines.push("", "═══════════════════════════════════════");
  return lines.join("\n");
}
