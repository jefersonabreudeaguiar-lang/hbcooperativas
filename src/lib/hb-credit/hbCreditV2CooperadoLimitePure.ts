import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { calcLimiteFromPercentual } from "@/modules/hb-credit/engine/creditBaseFromFicha";
import { hbCreditEffectiveDisponivelCents } from "@/modules/hb-credit/engine/paymentAffordability";

export function limiteExibicaoV2SemBrutoFicha(
  limite: ContaCoopLimiteCooperado
): ContaCoopLimiteCooperado {
  const usado = Math.max(0, Math.round(limite.valorUsadoCents ?? 0));
  return {
    ...limite,
    limiteLiberadoCents: 0,
    valorUsadoCents: usado,
    valorDisponivelCents: 0,
  };
}

function releasePercentV2(tetoPercent: number, liberacaoPercent: number | null): number {
  const tetoPct =
    Number.isFinite(tetoPercent) && tetoPercent > 0 && tetoPercent <= 100 ? tetoPercent : 100;
  const libPct =
    liberacaoPercent != null &&
    Number.isFinite(liberacaoPercent) &&
    liberacaoPercent > 0 &&
    liberacaoPercent <= 100
      ? liberacaoPercent
      : tetoPct;
  return Math.min(tetoPct, libPct);
}

/** V2 responsável/cooperado: liberado = % × bruto da ficha (não limit_released legado na nuvem). */
export function capLimiteContaCoopV2FichaBruto(
  limite: ContaCoopLimiteCooperado,
  brutoFichaCents: number,
  tetoPercent: number,
  liberacaoPercent: number | null
): ContaCoopLimiteCooperado {
  const bruto = Math.max(0, Math.round(brutoFichaCents));
  if (bruto <= 0 || !tetoPercent || tetoPercent <= 0) {
    return limiteExibicaoV2SemBrutoFicha(limite);
  }

  const usado = Math.max(0, Math.round(limite.valorUsadoCents ?? 0));
  const releasePct = releasePercentV2(tetoPercent, liberacaoPercent);
  let liberado = calcLimiteFromPercentual(bruto, releasePct);
  const tetoMax = calcLimiteFromPercentual(bruto, tetoPercent);
  if (liberado > tetoMax) liberado = tetoMax;
  if (liberado < usado) liberado = usado;

  return {
    ...limite,
    limiteLiberadoCents: liberado,
    valorUsadoCents: usado,
    valorDisponivelCents: hbCreditEffectiveDisponivelCents(liberado, bruto, usado),
  };
}
