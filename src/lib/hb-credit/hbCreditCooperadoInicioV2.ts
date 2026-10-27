import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { hbCreditEffectiveDisponivelCents } from "@/modules/hb-credit/engine/paymentAffordability";
import { hbCreditValorAReceberReaisFromManualBruto } from "@/lib/hb-credit/hbCreditManualValorBruto";
import { resolveBrutoFichaHbV2Cents } from "@/lib/hb-credit/hbCreditV2LimiteBase";

export { resolveBrutoFichaHbV2Cents } from "@/lib/hb-credit/hbCreditV2LimiteBase";

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
  /** Liberado já capado na API (% × bruto); omitir = usa conta (após cap no servidor). */
  valorLiberadoCents?: number | null;
};

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

  const limiteLiberadoCents =
    brutoFichaCents > 0
      ? Math.max(
          0,
          Math.round(
            opts?.valorLiberadoCents != null
              ? opts.valorLiberadoCents
              : account.limiteLiberadoCents ?? 0
          )
        )
      : 0;
  const saldoMercadoCents =
    brutoFichaCents > 0
      ? hbCreditEffectiveDisponivelCents(limiteLiberadoCents, brutoFichaCents, usadoCents)
      : 0;

  return {
    brutoFichaCents,
    aReceberCents,
    saldoMercadoCents,
    usadoCents,
    limiteLiberadoCents,
  };
}
