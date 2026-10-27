import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import type { InicioCardMotorSnapshot } from "@/lib/cooperadoInicioCardPolicy";
import { creditosBaseMapV2ManualOnly, isV2HbOnlyServer } from "@/lib/hb-credit/hbCreditV2LimiteBase";
import { round2 } from "@/utils/calculations";

/** Valor a receber V2: bruto manual − crédito HB já usado (amount_used na conta). */
export function hbCreditValorAReceberReaisFromManualBruto(
  manualValorBrutoCents: number | null | undefined,
  valorUsadoCents: number
): number {
  const bruto = Math.max(0, Math.round(Number(manualValorBrutoCents) || 0));
  if (bruto <= 0) return 0;
  const usado = Math.max(0, Math.round(Number(valorUsadoCents) || 0));
  return round2(Math.max(0, (bruto - usado) / 100));
}

export function mergeManualValorBrutoIntoCreditosBaseCents(
  creditosBaseCents: Record<string, number>,
  limites: Pick<ContaCoopLimiteCooperado, "cooperadoId" | "manualValorBrutoCents">[]
): Record<string, number> {
  if (isV2HbOnlyServer()) {
    const ids = [
      ...new Set([...Object.keys(creditosBaseCents), ...limites.map((l) => l.cooperadoId)]),
    ];
    return creditosBaseMapV2ManualOnly(ids, limites);
  }
  const out = { ...creditosBaseCents };
  for (const l of limites) {
    const manual = l.manualValorBrutoCents;
    if (manual != null && manual > 0) {
      out[l.cooperadoId] = manual;
    }
  }
  return out;
}

export function hbV2InicioCardSnapshotFromHbAccount(
  account: Pick<
    ContaCoopLimiteCooperado,
    "manualValorBrutoCents" | "valorUsadoCents"
  > | null,
  mesLabel: string
): InicioCardMotorSnapshot {
  const valor = account
    ? hbCreditValorAReceberReaisFromManualBruto(
        account.manualValorBrutoCents,
        account.valorUsadoCents
      )
    : 0;
  return {
    mesLabel: mesLabel.trim() || "—",
    valor,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}

export function parseManualValorBrutoReaisInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
