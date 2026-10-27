import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { resolveLimiteHbCooperadoEfetivo } from "@/modules/hb-credit/engine/creditBaseHbGuard";
import { hbCreditEffectiveDisponivelCents } from "@/modules/hb-credit/engine/paymentAffordability";
import { hbCreditValorAReceberReaisFromManualBruto } from "@/lib/hb-credit/hbCreditManualValorBruto";
import { creditoBaseCentsV2FromLimite } from "@/lib/hb-credit/hbCreditV2LimiteBase";

export type HbCreditCooperadoInicioV2Totais = {
  brutoFichaCents: number;
  aReceberCents: number;
  saldoMercadoCents: number;
  usadoCents: number;
  limiteLiberadoCents: number;
};

export type HbCreditCooperadoInicioV2TotaisOpts = {
  /** Bruto calculado da ficha plano (entregas − desconto) — prioridade sobre manual na nuvem. */
  brutoFichaPlanoCents?: number | null;
};

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

/** Início cooperado V2 — bruto da ficha HB e limite capado nessa base. */
export function hbCreditCooperadoInicioV2Totais(
  account: ContaCoopLimiteCooperado | null | undefined,
  opts?: HbCreditCooperadoInicioV2TotaisOpts
): HbCreditCooperadoInicioV2Totais | null {
  if (!account) return null;
  const brutoFichaCents = resolveBrutoFichaHbV2Cents(account, opts?.brutoFichaPlanoCents);
  const usadoCents = Math.max(0, Math.round(account.valorUsadoCents ?? 0));
  const aReceberReais = hbCreditValorAReceberReaisFromManualBruto(brutoFichaCents, usadoCents);
  const aReceberCents = Math.round(aReceberReais * 100);

  const eff = resolveLimiteHbCooperadoEfetivo(account, brutoFichaCents, 100, 100);
  const limiteLiberadoCents = Math.max(0, eff.limiteLiberadoCents ?? 0);
  const saldoMercadoCents = hbCreditEffectiveDisponivelCents(
    limiteLiberadoCents,
    brutoFichaCents > 0 ? brutoFichaCents : limiteLiberadoCents,
    usadoCents
  );

  return {
    brutoFichaCents,
    aReceberCents,
    saldoMercadoCents,
    usadoCents,
    limiteLiberadoCents,
  };
}
