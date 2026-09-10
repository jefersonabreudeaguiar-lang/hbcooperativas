import type { ProductionImpactReport } from "./types";
import { FLOW_LABELS } from "./mitigations";

export function formatProductionImpactReport(r: ProductionImpactReport): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════════════╗",
    "║  HB COOPERATIVAS — IMPACTO SE IMPLEMENTAR LAB EM PRODUÇÃO            ║",
    "║  (simulação · zero código alterado em src/)                          ║",
    "╚══════════════════════════════════════════════════════════════════════╝",
    "",
    `Gerado: ${r.generatedAt}`,
    r.disclaimer,
    "",
    "─── REGRESSÃO PRODUÇÃO (rodada real) ───",
  ];

  for (const t of r.regressionTests) {
    lines.push(`  ${t.passed ? "✓" : "✗"} ${t.name}: ${t.detail}`);
  }

  lines.push(
    "",
    "─── EVOLUÇÃO DO PLANO (5 iterações simuladas) ───",
    "     Cada iteração refina ordem, flags e safeguards até ~100% cenários OK.",
    ""
  );

  for (const it of r.iterations) {
    lines.push(
      `  Iteração ${it.iteration}: ${it.label}`,
      `    Taxa de sucesso: ${it.successPct}% (${it.passed}/${it.total} cenários)`,
      `    Ordem: ${it.order.join(" → ") || "—"}`,
      `    Flags: ${it.flags.join(" · ") || "—"}`
    );
    if (it.blockers.length) {
      lines.push(`    Bloqueios: ${it.blockers.join("; ")}`);
    }
    lines.push("");
  }

  lines.push(
    `TAXA FINAL (plano refinado iter. 5): ${r.finalSuccessPct}%`,
    `Pronto para implementar em produção: ${r.readyForProduction ? "SIM" : "NÃO — corrigir regressões e seguir ordem"}`,
    "",
    "─── ORDEM RECOMENDADA DE IMPLEMENTAÇÃO ───"
  );
  for (let i = 0; i < r.goOrder.length; i++) {
    lines.push(`  ${i + 1}. ${r.goOrder[i]}`);
  }

  lines.push("", "─── NÃO FAZER AINDA ───");
  for (const d of r.doNotDoYet) lines.push(`  • ${d}`);

  lines.push("", "─── MITIGAÇÕES × O QUE MUDA NO APP ───");
  for (const m of r.mitigations) {
    lines.push(
      `  ${m.id} [${m.priority}] ${m.name}`,
      `      Arquivos: ${m.touchpoints.slice(0, 2).join(", ")}${m.touchpoints.length > 2 ? "…" : ""}`,
      `      Fluxos afetados: ${(m.affectedFlows ?? []).map((f) => FLOW_LABELS[f]).join(" · ")}`,
      `      Se apressar: ${m.riskIfRushed}`,
      `      Safeguard: ${m.safeguards[0]}`
    );
  }

  lines.push("", "─── CENÁRIOS COM RISCO DE QUEBRAR FLUXO (plano ingênuo → refinado) ───");
  const risky = r.scenarios.filter((s) => !s.naiveOk && s.refinedOk);
  for (const s of risky.slice(0, 15)) {
    lines.push(
      `  ${s.id} [${s.kind}] ${s.title}`,
      `      Fluxo: ${FLOW_LABELS[s.flow]}`,
      `      Ingênuo: ✗ ${s.naiveNote}`,
      `      Refinado: ✓ ${s.refinedNote}`
    );
    if (s.userVisibleBreak) lines.push(`      Usuário vê: ${s.userVisibleBreak}`);
  }

  lines.push("", "─── CENÁRIOS RESIDUAIS (plano refinado ainda ✗) ───");
  const residual = r.scenarios.filter((s) => !s.refinedOk);
  if (residual.length === 0) {
    lines.push("  Nenhum.");
  } else {
    for (const s of residual) {
      lines.push(`  ${s.id} — ${s.title}: ${s.refinedNote}`);
    }
  }

  lines.push(
    "",
    "─── MATRIZ RESUMO POR FLUXO ───",
    "     % = cenários OK com plano refinado (iter. 5)"
  );

  const byFlow = new Map<string, { ok: number; total: number }>();
  for (const s of r.scenarios) {
    const b = byFlow.get(s.flow) ?? { ok: 0, total: 0 };
    b.total += 1;
    if (s.refinedOk) b.ok += 1;
    byFlow.set(s.flow, b);
  }
  for (const [flow, { ok, total }] of byFlow) {
    const pct = Math.round((ok / total) * 100);
    lines.push(`  ${FLOW_LABELS[flow as keyof typeof FLOW_LABELS]}: ${pct}% (${ok}/${total})`);
  }

  lines.push(
    "",
    "─── CONCLUSÃO ───",
    r.readyForProduction
      ? "  Plano refinado atinge meta. Pode iniciar implementação na ordem goOrder."
      : `  Meta ~100%: ${r.finalSuccessPct}% cenários OK. Gate bloqueante: test:sync-flows (M2) antes de qualquer deploy sync.`,
    "  Implementação real exige 1 PR por mitigação + homologação CoopeagriPla após cada passo.",
    ""
  );

  return lines.join("\n");
}
