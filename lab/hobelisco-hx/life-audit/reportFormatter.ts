import type { LifeAuditReport } from "./types";

export function formatLifeAuditMarkdown(report: LifeAuditReport): string {
  const lines: string[] = [
    "# HOBELISCO V1 — Life Audit Report",
    "",
    `**Gerado:** ${report.generatedAt}`,
    `**Versão:** ${report.version}`,
    `**Veredito:** ${report.lifeVerdict}`,
    `**Vitality Score:** ${report.vitality.overall}/100`,
    "",
    "## Resumo executivo",
    "",
    `- Testes: **${report.passed}/${report.totalTests} PASS** (${report.failed} FAIL, ${report.gaps} GAP, ${report.notExecuted} NOT_EXECUTED)`,
    `- Boundary lab: **${report.boundaryOk ? "OK" : "VIOLATION"}**`,
    `- Cenários Arena: ${report.scenarios}`,
    `- Micro-simulações: ${report.microSimulations}`,
    "",
    "## Vitality dimensions",
    "",
    ...Object.entries(report.vitality.dimensions).map(
      ([k, v]) => `- ${k}: ${v}/100`
    ),
    "",
  ];

  if (report.defenseComparison) {
    const d = report.defenseComparison;
    lines.push(
      "## Comparação de defesas",
      "",
      `- ${d.defenseA}: survival ${d.survivalA}%`,
      `- ${d.defenseB}: survival ${d.survivalB}%`,
      `- Vencedor: **${d.winner}** — ${d.reason}`,
      ""
    );
  }

  lines.push("## Testes por fase", "");
  for (const t of report.tests) {
    lines.push(`- [${t.status}] **${t.id}** (F${t.phase}) — ${t.name}: ${t.detail}`);
  }

  lines.push("", "## Correções aplicadas", "");
  for (const c of report.correctionsApplied) lines.push(`- ${c}`);

  lines.push("", "## Correções NÃO aplicadas (V2+)", "");
  for (const c of report.correctionsNotApplied) lines.push(`- ${c}`);

  lines.push("", "## Gaps documentados", "");
  for (const g of report.gapsDocumented) lines.push(`- ${g}`);

  lines.push("", "## Recomendação V2", "");
  lines.push(
    report.lifeVerdict === "LIFE-GREEN"
      ? "Prosseguir para observe-only com sensores reais e persistência hb_hobelisco_* em staging."
      : report.lifeVerdict === "LIFE-AMBER"
        ? "Corrigir falhas high/medium antes de V2; manter lab-only."
        : "Não promover. Corrigir falhas critical e boundary antes de qualquer integração."
  );

  return lines.join("\n");
}

export function formatLifeAuditText(report: LifeAuditReport): string {
  return [
    "═".repeat(60),
    " HOBELISCO HX V1 — LIFE AUDIT",
    "═".repeat(60),
    `Veredito: ${report.lifeVerdict}`,
    `Vitality: ${report.vitality.overall}/100`,
    `Tests: ${report.passed}/${report.totalTests} PASS`,
    `Boundary: ${report.boundaryOk ? "OK" : "FAIL"}`,
    "═".repeat(60),
    formatLifeAuditMarkdown(report),
  ].join("\n");
}
