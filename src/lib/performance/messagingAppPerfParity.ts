/**
 * Comparativo read-only HB Coop (PWA) vs apps de mensagem (ex.: WhatsApp).
 * Referências de mercado para homolog — não altera sync, fichas ou resumos.
 */
import type { RqlPerfRouteReport } from "@/lib/performance/rqlPerfReport";

/** Faixas típicas documentadas (app nativo, celular médio). */
export const WHATSAPP_REFERENCE = {
  tabSwitchPaintP75Ms: 55,
  tabSwitchPaintP95Ms: 80,
  inpMs: 50,
  coldStartMs: 1200,
  /** Notas subjetivas de referência (0–10) para dimensões sem telemetria automática. */
  scores: {
    tabSwitch: 9.5,
    haptic: 9,
    touchResponse: 9.5,
    coldStart: 9,
    scroll: 9,
    backgroundSync: 9.5,
    offline: 8.5,
    memory: 8,
  } as const,
} as const;

export const HB_COOP_SLO = {
  tabSwitchPaintP75Ms: 200,
} as const;

export type MessagingParityDimension = {
  id: string;
  label: string;
  unit: "ms" | "score";
  whatsappValue: number | null;
  hbCoopValue: number | null;
  whatsappScore: number;
  hbCoopScore: number;
  detail: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Quanto menor o ms, melhor — nota 10 no alvo WhatsApp, 0 em failMs. */
export function scoreMsLowerIsBetter(
  ms: number | null,
  targetMs: number,
  failMs: number
): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms <= targetMs) return 10;
  if (ms >= failMs) return 0;
  return round1(10 * (1 - (ms - targetMs) / (failMs - targetMs)));
}

export type MessagingParityReport = {
  generatedAt: string;
  dimensions: MessagingParityDimension[];
  whatsappAverageScore: number;
  hbCoopAverageScore: number;
  gapScore: number;
  sloTabPaintP75Ms: number;
  measuredTabPaintP75Ms: number | null;
};

export function buildMessagingParityReport(rql: RqlPerfRouteReport): MessagingParityReport {
  const p75 = rql.paintPercentiles.p75;
  const p50 = rql.paintPercentiles.p50;
  const longTasks = rql.longTasksSample.length;
  const longWorst =
    rql.longTasksSample.length > 0
      ? Math.max(...rql.longTasksSample.map((t) => t.duration))
      : null;

  const tabScoreHb = scoreMsLowerIsBetter(
    p75,
    WHATSAPP_REFERENCE.tabSwitchPaintP75Ms,
    HB_COOP_SLO.tabSwitchPaintP75Ms
  );
  const tabScoreWa = WHATSAPP_REFERENCE.scores.tabSwitch;

  const touchHb = scoreMsLowerIsBetter(longWorst, WHATSAPP_REFERENCE.inpMs, 400);
  const touchWa = WHATSAPP_REFERENCE.scores.touchResponse;
  const coldMs = rql.coldStartSpanMs;
  const coldHb = scoreMsLowerIsBetter(coldMs, WHATSAPP_REFERENCE.coldStartMs, 4000);

  const dimensions: MessagingParityDimension[] = [
    {
      id: "tab_switch_paint_p75",
      label: "Troca de aba (paint p75)",
      unit: "ms",
      whatsappValue: WHATSAPP_REFERENCE.tabSwitchPaintP75Ms,
      hbCoopValue: p75,
      whatsappScore: tabScoreWa,
      hbCoopScore: tabScoreHb ?? round1((tabScoreWa * 7) / 10),
      detail: `SLO HB ≤${HB_COOP_SLO.tabSwitchPaintP75Ms}ms | amostras=${rql.paintPercentiles.count}`,
    },
    {
      id: "tab_switch_paint_p50",
      label: "Troca de aba (paint p50)",
      unit: "ms",
      whatsappValue: 40,
      hbCoopValue: p50,
      whatsappScore: 9.5,
      hbCoopScore: scoreMsLowerIsBetter(p50, 40, 180) ?? 7,
      detail: "Proxy de fluidez na mediana",
    },
    {
      id: "haptic_visual",
      label: "Feedback ao trocar aba (vibração + pulso visual)",
      unit: "score",
      whatsappValue: null,
      hbCoopValue: null,
      whatsappScore: WHATSAPP_REFERENCE.scores.haptic,
      hbCoopScore: 8.5,
      detail: "HB: vibrate(10ms) + pulso 180ms — cooperado e responsável mobile",
    },
    {
      id: "touch_longtask",
      label: "Resposta ao toque (pior long task amostra)",
      unit: "ms",
      whatsappValue: WHATSAPP_REFERENCE.inpMs,
      hbCoopValue: longWorst,
      whatsappScore: touchWa,
      hbCoopScore: touchHb ?? (longTasks === 0 ? 7.5 : 6.5),
      detail: `long tasks na amostra: ${longTasks}`,
    },
    {
      id: "cold_start",
      label: "Cold start (span rql:cold:*)",
      unit: "ms",
      whatsappValue: WHATSAPP_REFERENCE.coldStartMs,
      hbCoopValue: coldMs,
      whatsappScore: WHATSAPP_REFERENCE.scores.coldStart,
      hbCoopScore: coldHb ?? (coldMs == null ? 5.5 : 6),
      detail:
        coldMs != null
          ? `medido ${coldMs}ms (shell_visual → shell_interactive)`
          : "Abra o app e rode printWhatsappCompare de novo",
    },
    {
      id: "scroll_lists",
      label: "Scroll / listas (referência)",
      unit: "score",
      whatsappValue: null,
      hbCoopValue: null,
      whatsappScore: WHATSAPP_REFERENCE.scores.scroll,
      hbCoopScore: 6.5,
      detail: "Listas React vs recycler nativo",
    },
    {
      id: "background_sync",
      label: "Dados em background (referência)",
      unit: "score",
      whatsappValue: null,
      hbCoopValue: null,
      whatsappScore: WHATSAPP_REFERENCE.scores.backgroundSync,
      hbCoopScore: 6,
      detail: "Pull operacional vs push nativo",
    },
  ];

  const waAvg = round1(dimensions.reduce((s, d) => s + d.whatsappScore, 0) / dimensions.length);
  const hbAvg = round1(dimensions.reduce((s, d) => s + d.hbCoopScore, 0) / dimensions.length);

  return {
    generatedAt: rql.generatedAt,
    dimensions,
    whatsappAverageScore: waAvg,
    hbCoopAverageScore: hbAvg,
    gapScore: round1(waAvg - hbAvg),
    sloTabPaintP75Ms: rql.sloL1PaintP75Ms,
    measuredTabPaintP75Ms: p75,
  };
}

export function formatMessagingParitySummary(report: MessagingParityReport): string {
  const slo =
    report.measuredTabPaintP75Ms != null
      ? report.measuredTabPaintP75Ms <= report.sloTabPaintP75Ms
        ? "OK"
        : "ACIMA"
      : "—";
  return [
    `HB Coop vs WhatsApp (paridade UX) — ${report.generatedAt}`,
    `Nota média HB ${report.hbCoopAverageScore}/10 | WhatsApp ref. ${report.whatsappAverageScore}/10 | gap ${report.gapScore}`,
    `Troca de aba paint p75=${report.measuredTabPaintP75Ms ?? "—"}ms (SLO ${report.sloTabPaintP75Ms}ms: ${slo})`,
  ].join("\n");
}
