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

/** Início cooperado V2 — só bruto da ficha HB (manual) e limite capado nessa base. */
export function hbCreditCooperadoInicioV2Totais(
  account: ContaCoopLimiteCooperado | null | undefined
): HbCreditCooperadoInicioV2Totais | null {
  if (!account) return null;
  const brutoFichaCents = creditoBaseCentsV2FromLimite(account);
  const usadoCents = Math.max(0, Math.round(account.valorUsadoCents ?? 0));
  const aReceberReais = hbCreditValorAReceberReaisFromManualBruto(
    account.manualValorBrutoCents,
    usadoCents
  );
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
