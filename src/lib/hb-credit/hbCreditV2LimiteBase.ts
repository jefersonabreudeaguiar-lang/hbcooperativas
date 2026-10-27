import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { resolveV2HbOnlyPublicEnv } from "@/lib/product/v2HbOnly";

export function isV2HbOnlyServer(): boolean {
  return resolveV2HbOnlyPublicEnv(process.env.NEXT_PUBLIC_V2_HB_ONLY) === "1";
}

/** V2: limite e liberação usam só o bruto manual da ficha HB (0 se não preenchido). */
export function creditoBaseCentsV2FromLimite(
  limite: Pick<ContaCoopLimiteCooperado, "manualValorBrutoCents">,
  _operationalCents = 0
): number {
  const manual = Math.max(0, Math.round(Number(limite.manualValorBrutoCents) || 0));
  return manual;
}

/** Fonte única do bruto V2: ficha plano quando informada; senão manual na conta HB. */
export function resolveBrutoFichaHbV2Cents(
  account: Pick<ContaCoopLimiteCooperado, "manualValorBrutoCents">,
  brutoFichaPlanoCents?: number | null
): number {
  if (brutoFichaPlanoCents != null) {
    return Math.max(0, Math.round(brutoFichaPlanoCents));
  }
  return creditoBaseCentsV2FromLimite(account);
}

export function creditosBaseMapV2ManualOnly(
  cooperadoIds: string[],
  limites: Pick<ContaCoopLimiteCooperado, "cooperadoId" | "manualValorBrutoCents">[]
): Record<string, number> {
  const byId = new Map(limites.map((l) => [l.cooperadoId, l]));
  const out: Record<string, number> = {};
  for (const id of cooperadoIds) {
    const lim = byId.get(id);
    out[id] = lim ? creditoBaseCentsV2FromLimite(lim) : 0;
  }
  return out;
}

/** V2: base de teto/limites = bruto da ficha plano (prioridade) com fallback manual na conta. */
export function creditosBaseMapV2FichaAlinhada(
  cooperadoIds: string[],
  limites: Pick<ContaCoopLimiteCooperado, "cooperadoId" | "manualValorBrutoCents">[],
  fichaBrutoByCooperadoId: Record<string, number>
): Record<string, number> {
  const byId = new Map(limites.map((l) => [l.cooperadoId, l]));
  const out: Record<string, number> = {};
  for (const id of cooperadoIds) {
    const lim = byId.get(id);
    const fichaBruto = fichaBrutoByCooperadoId[id];
    out[id] = resolveBrutoFichaHbV2Cents(
      lim ?? { manualValorBrutoCents: null },
      fichaBruto != null ? fichaBruto : null
    );
  }
  return out;
}

export function brutoV2FichaAtivoCents(
  limite: Pick<ContaCoopLimiteCooperado, "manualValorBrutoCents"> | undefined,
  fichaBrutoCents: number | null | undefined
): number {
  return resolveBrutoFichaHbV2Cents(limite ?? { manualValorBrutoCents: null }, fichaBrutoCents ?? null);
}
