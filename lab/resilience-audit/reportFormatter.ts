import type { ResilienceAuditReport, ScenarioResult } from "./types";
import type { HardeningRound } from "./types";
import { HARDENING_ROUNDS, enabledLabels } from "./hardeningPolicy";
import { runAllScenarios, scoreRound } from "./scenarioRunner";
import { runSyncAudit } from "../sync-update/scoreAudit";

const ACCEPTED_RISKS = [
  "Last-write-wins em operacional monolítico até sync por slices ir para produção.",
  "Cooperados homônimos duplicados exigem limpeza manual (detectado, não auto-merge).",
  "AUTH_SECRET em vercel.json: risco aceito só até rotação — corrigir antes de escala SaaS.",
  "Conta Asaas PF em análise: cobrança HB manual temporária.",
  "100% invulnerável é impossível; meta lab: 0 falhas critical/high com hardening round 3.",
];

export function runResilienceAudit(): ResilienceAuditReport {
  const rounds: HardeningRound[] = [];
  let lastResults: ScenarioResult[] = [];
  let bestRound = 0;
  let bestScore = 0;

  for (const { round, label, flags } of HARDENING_ROUNDS) {
    const results = runAllScenarios(flags);
    const score = scoreRound(results);
    const failed = results.filter((r) => !r.passed);
    const criticalOpen = failed.filter((r) => r.severity === "critical" || r.severity === "high").length;

    rounds.push({
      round,
      label,
      enabled: enabledLabels(flags),
      score,
      passed: results.filter((r) => r.passed).length,
      failed: failed.length,
      criticalOpen,
    });

    if (score >= bestScore) {
      bestScore = score;
      bestRound = round;
      lastResults = results.map((r) => ({ ...r, fixedByRound: r.passed ? round : undefined }));
    }
  }

  const syncAudit = runSyncAudit();
  const finalRound = rounds[rounds.length - 1];
  const invulnerable =
    finalRound.criticalOpen === 0 && finalRound.score >= 9.5;

  const recommendations = buildRecommendations(lastResults, syncAudit.afterOverall);

  return {
    generatedAt: new Date().toISOString(),
    rounds,
    scenarios: lastResults,
    finalScore: finalRound.score,
    invulnerable,
    acceptedRisks: ACCEPTED_RISKS,
    recommendations,
    syncAuditOverall: { before: syncAudit.beforeOverall, after: syncAudit.afterOverall },
  };
}

function buildRecommendations(results: ScenarioResult[], syncAfter: number): string[] {
  const rec: string[] = [];
  const failed = results.filter((r) => !r.passed);

  if (failed.some((r) => r.id === "sec-01")) {
    rec.push("P0: Remover AUTH_SECRET de vercel.json; usar variável de ambiente e rotacionar.");
  }
  if (failed.some((r) => r.id.startsWith("sync-05") || r.id === "sync-06")) {
    rec.push("P1: Promover sync por slices do lab após npm run test:sync-flows verde.");
  }
  if (failed.some((r) => r.id.startsWith("coh-"))) {
    rec.push("P1: Bloquear push operacional quando coherenceValidator retorna severity=block.");
  }
  if (failed.some((r) => r.id.startsWith("cap-02"))) {
    rec.push("P2: Política de arquivamento mensal quando operacional >80% de 5 MB.");
  }
  if (failed.some((r) => r.id === "mc-01")) {
    rec.push("P2: Ferramenta admin merge cooperados duplicados (CoopeagriPla).");
  }
  if (failed.some((r) => r.id === "caos-01")) {
    rec.push("P2: Fingerprints por slice + merge 3-way (lab proposedPolicy → produção).");
  }
  rec.push(`Sync audit lab pós-hardening: ${syncAfter}/10 — promover só com PR dedicado.`);
  rec.push("Rodar npm run test:sync-flows + lab:resilience-audit antes de cada release major.");

  return rec;
}

export function formatResilienceReportText(report: ResilienceAuditReport): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════════════╗",
    "║  HB COOPERATIVAS — AUDITORIA DE RESILIÊNCIA (LAB ISOLADO)            ║",
    "╚══════════════════════════════════════════════════════════════════════╝",
    "",
    `Gerado: ${report.generatedAt}`,
    `Escopo: todos os fluxos simulados · 4 rodadas de hardening · zero alteração em src/ produção`,
    "",
    "─── EVOLUÇÃO POR RODADA ───",
  ];

  for (const r of report.rounds) {
    lines.push(
      `  R${r.round} ${r.label}`,
      `      Score: ${r.score}/10 · OK ${r.passed} · Falhas ${r.failed} · Critical/High abertos: ${r.criticalOpen}`,
      `      Hardening: ${r.enabled.length ? r.enabled.join(" · ") : "(nenhum)"}`,
      ""
    );
  }

  lines.push(
    `NOTA FINAL (R3): ${report.finalScore}/10`,
    `Invulnerável (0 critical/high): ${report.invulnerable ? "SIM" : "NÃO — riscos residuais documentados"}`,
    ""
  );

  if (report.syncAuditOverall) {
    lines.push(
      "─── SYNC AUDIT (lab/sync-update) ───",
      `  Antes: ${report.syncAuditOverall.before}/10 → Depois: ${report.syncAuditOverall.after}/10`,
      ""
    );
  }

  lines.push("─── CENÁRIOS (rodada final) ───");
  const byDomain = new Map<string, ScenarioResult[]>();
  for (const s of report.scenarios) {
    const list = byDomain.get(s.domain) ?? [];
    list.push(s);
    byDomain.set(s.domain, list);
  }
  for (const [domain, list] of byDomain) {
    lines.push(`  [${domain.toUpperCase()}]`);
    for (const s of list) {
      const icon = s.passed ? "✓" : "✗";
      lines.push(`    ${icon} ${s.id} ${s.title} (${s.severity})`);
      if (s.weakness && !s.passed) lines.push(`        Fraqueza: ${s.weakness}`);
      if (s.mitigation) lines.push(`        Mitigação lab: ${s.mitigation}`);
    }
    lines.push("");
  }

  lines.push("─── FALHAS RESIDUAIS (rodada final) ───");
  const fails = report.scenarios.filter((s) => !s.passed);
  if (fails.length === 0) {
    lines.push("  Nenhuma.");
  } else {
    for (const f of fails) {
      lines.push(`  • ${f.id} — ${f.title}: ${f.weakness ?? "ver cenário"}`);
    }
  }

  lines.push("", "─── RISCOS ACEITOS (realismo) ───");
  for (const a of report.acceptedRisks) lines.push(`  • ${a}`);

  lines.push("", "─── RECOMENDAÇÕES PARA PRODUÇÃO ───");
  for (const r of report.recommendations) lines.push(`  → ${r}`);

  lines.push(
    "",
    "─── CONCLUSÃO ───",
    report.invulnerable
      ? "  Lab atingiu meta de hardening. Promover mitigações via PRs separados — nunca merge direto do lab."
      : "  Lab endureceu fluxos críticos; produção atual segura para 1 cooperativa (~30 coop). Escala SaaS exige P0/P1 acima.",
    ""
  );

  return lines.join("\n");
}
