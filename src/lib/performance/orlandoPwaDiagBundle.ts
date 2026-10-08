/**
 * Pacote único para homolog Orlando — performance (RQL) + paridade financeira vs responsável.
 */
import type { User } from "@/types";
import { buildCooperadoFinanceiroParidadeProbe } from "@/lib/cooperado/cooperadoFinanceiroParidadeProbe";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  buildRqlWhatsappCompareClipboardText,
  buildRqlPerfRouteReport,
} from "@/lib/performance/rqlPerfReport";
import { formatMessagingParitySummary, buildMessagingParityReport } from "@/lib/performance/messagingAppPerfParity";
import { measureRqlColdStartSpanMs } from "@/lib/performance/rqlMarks";

export const ORLANDO_PWA_DIAG_ROTEIRO_VERSION = "2026-10-08-v1";

/** Texto para Orlando colar no WhatsApp após o roteiro de 3 minutos. */
export function buildOrlandoFullDiagClipboardText(
  user: Omit<User, "password"> | null | undefined
): string {
  const rqlText = buildRqlWhatsappCompareClipboardText();
  const rql = buildRqlPerfRouteReport();
  const parity = buildMessagingParityReport(rql);
  const fin = buildCooperadoFinanceiroParidadeProbe(user);
  const coldMs = measureRqlColdStartSpanMs();

  const hops = rql.routeTransitions
    .slice(-12)
    .map((t) => `${t.transition} → ${t.toHop}: paint ${t.paintMs ?? "—"}ms`)
    .join("\n");

  const lines = [
    `=== HB DIAG ORLANDO · roteiro ${ORLANDO_PWA_DIAG_ROTEIRO_VERSION} ===`,
    `build v${APP_BUILD_VERSION} · ${new Date().toISOString()}`,
    `cold_start_ms: ${coldMs ?? "—"}`,
    `standalone: ${fin?.standalone ?? "—"}`,
    "",
    "--- PERFORMANCE (vs WhatsApp ref) ---",
    formatMessagingParitySummary(parity),
    "",
    rqlText,
    "",
    "--- ÚLTIMAS TROCAS DE ABA (paint) ---",
    hops || "(nenhuma — repita o roteiro trocando Início/Entregas/Preços/Financeiro)",
    "",
    "--- PARIDADE A RECEBER (cooperado vs motor responsável) ---",
  ];

  if (fin) {
    lines.push(
      `paridade_valor: ${fin.paridade.valorLiquido} | mes: ${fin.paridade.mesLabel}`,
      `meses_paridade: ${fin.paridade.mesesResumo.join(", ") || "—"}`,
      `card_motor: ${fin.motorCard.valor} | cache_local: ${fin.persistido?.valor ?? "—"}`,
      `responsavel_meses_pagar: ${fin.responsavel.mesesPendentesPagar.join(", ") || "—"}`,
      `responsavel_valor_resumo: ${fin.responsavel.valorLiquidoResumoStaff ?? "—"}`,
      `alinhado_responsavel: ${fin.responsavel.alinhadoComParidade ? "SIM" : "NÃO"}`,
      "",
      "--- JSON (opcional) ---",
      JSON.stringify(fin, null, 2)
    );
  } else {
    lines.push("(AppData ainda carregando — gere de novo após abrir o Início)");
  }

  return lines.join("\n");
}

/** Roteiro curto para enviar ao cooperado Orlando (WhatsApp). */
export function orlandoPwaDiagRoteiroInstrucoes(appUrl = "https://hbcooperativas.vercel.app"): string {
  return [
    "📋 ROTEIRO DIAGNÓSTICO HB (Orlando) — ~3 min",
    "",
    "1) Feche o app completamente (não só minimizar).",
    `2) Abra de novo pelo ícone do PWA (build v${APP_BUILD_VERSION} ou mais novo na faixa verde).`,
    "3) Na faixa verde acima do rodapé: toque «Medir abas» OU segure ~1s no «v…».",
    "4) Toque «Ativar medição e recarregar» (só na 1ª vez).",
    "",
    "5) ROTEIRO DE USO (cronometre mentalmente se quiser):",
    "   a) Parado no Início 5s",
    "   b) Entregas → Preços → Financeiro → Início (1 toque em cada aba)",
    "   c) Repita (b) mais uma vez (2ª volta nas abas)",
    "   d) Feche o app → abra de novo → pare no Início 5s",
    "",
    "6) Segure de novo no «v…» → «Gerar pacote diagnóstico completo» (ou «Comparativo WhatsApp» se não aparecer).",
    "7) «Copiar relatório» e envie o texto INTEIRO para o Jeferson (WhatsApp).",
    "",
    "Opcional (link com medição):",
    `${appUrl}/dashboard?hbRqlPerf=1`,
    "",
    "Não precisa abrir console nem modo desenvolvedor.",
  ].join("\n");
}
