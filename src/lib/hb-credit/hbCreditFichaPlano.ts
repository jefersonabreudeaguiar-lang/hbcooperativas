import { round2 } from "@/utils/calculations";

export type HbCreditMensalidadePlano = {
  id: string;
  label: string;
  /** ISO date YYYY-MM-DD */
  dataCobranca: string;
  valorCents: number;
  /** Cobrada em um pagamento HB (ledger). */
  cobradaEm?: string | null;
};

/** Entregas arquivadas na nuvem — não entram no bruto nem na UI do cooperado. */
export type HbCreditFichaPlanoHistoricoCiclo = {
  archivedAt: string;
  entrega1Cents: number;
  entrega2Cents: number;
  entrega3Cents: number;
  entrega4Cents: number;
  entrega5Cents: number;
  descontoPercent: number;
  brutoCents: number;
};

export type HbCreditFichaPlano = {
  cooperadoId: string;
  entrega1Cents: number;
  entrega2Cents: number;
  entrega3Cents: number;
  entrega4Cents: number;
  entrega5Cents: number;
  descontoPercent: number;
  mensalidades: HbCreditMensalidadePlano[];
  /** Quantas “entregas” HB já consumidas no ciclo (compras com crédito). */
  entregasConsumidas: number;
  historicoCiclos?: HbCreditFichaPlanoHistoricoCiclo[];
  updatedAt?: string;
};

export const HB_FICHA_PLANO_EMPTY: Omit<HbCreditFichaPlano, "cooperadoId"> = {
  entrega1Cents: 0,
  entrega2Cents: 0,
  entrega3Cents: 0,
  entrega4Cents: 0,
  entrega5Cents: 0,
  descontoPercent: 0,
  mensalidades: [],
  entregasConsumidas: 0,
  historicoCiclos: [],
};

export function somaEntregasPlanoCents(
  plano: Pick<
    HbCreditFichaPlano,
    "entrega1Cents" | "entrega2Cents" | "entrega3Cents" | "entrega4Cents" | "entrega5Cents"
  >
): number {
  return (
    Math.max(0, plano.entrega1Cents) +
    Math.max(0, plano.entrega2Cents) +
    Math.max(0, plano.entrega3Cents) +
    Math.max(0, plano.entrega4Cents) +
    Math.max(0, plano.entrega5Cents)
  );
}

/** Bruto da ficha HB = soma das entregas 1–5 menos desconto %. */
export function brutoFichaPlanoCents(plano: Pick<HbCreditFichaPlano, keyof typeof HB_FICHA_PLANO_EMPTY>): number {
  const bruto = somaEntregasPlanoCents(plano);
  const pct = Math.min(100, Math.max(0, Number(plano.descontoPercent) || 0));
  const desconto = Math.round(bruto * (pct / 100));
  return Math.max(0, bruto - desconto);
}

export function brutoFichaPlanoReais(plano: Pick<HbCreditFichaPlano, keyof typeof HB_FICHA_PLANO_EMPTY>): number {
  return round2(brutoFichaPlanoCents(plano) / 100);
}

/** Aceita 1500, 1.500,50, 1500,50 — até 999.999,99 (centavos em bigint seguro). */
export function parseReaisToCentsInput(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  let normalized = t;
  if (hasComma) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    const parts = t.split(".");
    if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
      normalized = parts.join(".");
    } else {
      normalized = t.replace(/\./g, "");
    }
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  const cents = Math.round(n * 100);
  const max = 99_999_999_99;
  return Math.min(max, cents);
}

export function formatCentsInputReais(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function reaisDraftFromCents(cents: number): string {
  if (!cents) return "";
  return formatCentsInputReais(cents);
}

/** Mensalidades com data de cobrança vencida e ainda não cobradas. */
export function mensalidadesPendentesPlano(
  plano: Pick<HbCreditFichaPlano, "mensalidades">,
  hojeIso = new Date().toISOString().slice(0, 10)
): HbCreditMensalidadePlano[] {
  return (plano.mensalidades ?? []).filter(
    (m) => m.valorCents > 0 && !m.cobradaEm && m.dataCobranca && m.dataCobranca <= hojeIso
  );
}

export function totalMensalidadesPendentesCents(
  plano: Pick<HbCreditFichaPlano, "mensalidades">,
  hojeIso?: string
): number {
  return mensalidadesPendentesPlano(plano, hojeIso).reduce((s, m) => s + m.valorCents, 0);
}
