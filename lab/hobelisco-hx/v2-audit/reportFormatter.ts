import type { V2StagingAuditReport } from "./types";

export function formatV2AuditText(report: V2StagingAuditReport): string {
  const lines = [
    "════════════════════════════════════════════════════════════",
    " HOBELISCO HX V2 — STAGING OBSERVE-ONLY AUDIT",
    "════════════════════════════════════════════════════════════",
    `Veredito: ${report.verdict}`,
    `Observation Readiness: ${report.observationReadiness.overall}/100`,
    `V2 Tests: ${report.passed}/${report.totalTests} PASS`,
    `V1 Regression: ${report.v1Regression.ok ? "OK" : "FAIL"}`,
    `Staging: ${report.stagingConnection}`,
    "════════════════════════════════════════════════════════════",
  ];
  for (const t of report.tests) {
    lines.push(`[${t.status}] ${t.id} — ${t.name}: ${t.detail}`);
  }
  return lines.join("\n");
}

export function formatV2AuditMarkdown(report: V2StagingAuditReport): string {
  return `# HOBELISCO HX V2 — STAGING OBSERVE-ONLY AUDIT

**Gerado:** ${report.generatedAt}
**Versão:** ${report.v2Version}
**Veredito:** ${report.verdict}
**Observation Readiness:** ${report.observationReadiness.overall}/100
**Staging connection:** ${report.stagingConnection}

## Resumo

- V2 tests: **${report.passed}/${report.totalTests} PASS** (${report.failed} FAIL, ${report.notValidated} NOT_VALIDATED)
- V1 Life Audit: **${report.v1Regression.lifeAudit.pass}/${report.v1Regression.lifeAudit.total}** ${report.v1Regression.lifeAudit.ok ? "OK" : "FAIL"}
- V1 Arena: **${report.v1Regression.arena.pass}/${report.v1Regression.arena.total}** ${report.v1Regression.arena.ok ? "OK" : "FAIL"}

## Observation Readiness

${Object.entries(report.observationReadiness.dimensions)
  .map(([k, v]) => `- ${k}: ${v}/100`)
  .join("\n")}

## Métricas

${Object.entries(report.metrics)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Testes

${report.tests.map((t) => `- [${t.status}] **${t.id}** — ${t.detail}`).join("\n")}

## Limitações

${report.limitations.map((l) => `- ${l}`).join("\n")}

## Riscos

${report.risks.map((r) => `- ${r}`).join("\n")}

## Certificado

\`${report.certificatePath}\`

> Validado dentro do escopo observe-only lab/staging. Não implica segurança absoluta.
`;
}
