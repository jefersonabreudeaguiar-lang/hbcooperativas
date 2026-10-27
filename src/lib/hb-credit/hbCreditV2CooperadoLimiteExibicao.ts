import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { resolveLimiteHbCooperadoEfetivo } from "@/modules/hb-credit/engine/creditBaseHbGuard";
import { hbCreditEffectiveDisponivelCents } from "@/modules/hb-credit/engine/paymentAffordability";
import { creditosBaseMapV2FichaAlinhada } from "@/lib/hb-credit/hbCreditV2LimiteBase";
import {
  getCooperativaLiberacaoPercentConfigured,
  resolveTetoGlobal,
} from "@/lib/supabase/contaCoopStorage";

export type HbV2FichaLimiteExibicao = {
  valorLiberadoCents: number;
  liberacaoPercent: number | null;
};

export function limiteExibicaoV2SemBrutoFicha(limite: ContaCoopLimiteCooperado): ContaCoopLimiteCooperado {
  return {
    ...limite,
    limiteLiberadoCents: 0,
    valorUsadoCents: 0,
    valorDisponivelCents: 0,
  };
}

export function capLimiteContaCoopV2FichaBruto(
  limite: ContaCoopLimiteCooperado,
  brutoFichaCents: number,
  tetoPercent: number,
  liberacaoPercent: number | null
): ContaCoopLimiteCooperado {
  if (brutoFichaCents <= 0) return limiteExibicaoV2SemBrutoFicha(limite);
  if (!tetoPercent || tetoPercent <= 0) return limiteExibicaoV2SemBrutoFicha(limite);
  const capped = resolveLimiteHbCooperadoEfetivo(
    limite,
    brutoFichaCents,
    tetoPercent,
    liberacaoPercent
  );
  const usado = Math.max(0, Math.round(capped.valorUsadoCents ?? 0));
  return {
    ...capped,
    valorDisponivelCents: hbCreditEffectiveDisponivelCents(
      capped.limiteLiberadoCents,
      brutoFichaCents,
      usado
    ),
  };
}

/** V2 staff: limites na API/UI só refletem bruto da ficha HB (sem residual de ciclo antigo). */
export async function capLimitesListaV2PorFichaBruto(
  supabase: SupabaseClient,
  cnpj: string,
  limites: ContaCoopLimiteCooperado[],
  fichaBrutoByCooperadoId: Record<string, number>
): Promise<ContaCoopLimiteCooperado[]> {
  const ids = [...new Set(limites.map((l) => l.cooperadoId))];
  const bases = creditosBaseMapV2FichaAlinhada(ids, limites, fichaBrutoByCooperadoId);
  const teto = await resolveTetoGlobal(supabase, cnpj, bases);
  const tetoPercent = teto.configured ? teto.percent : 0;
  const liberacaoPercent = teto.configured
    ? (await getCooperativaLiberacaoPercentConfigured(supabase, cnpj)) ?? tetoPercent
    : null;

  return limites.map((l) => {
    const bruto = Math.max(0, Math.round(fichaBrutoByCooperadoId[l.cooperadoId] ?? 0));
    const capped = capLimiteContaCoopV2FichaBruto(l, bruto, tetoPercent, liberacaoPercent);
    return { ...capped, fichaPlanoBrutoCents: bruto };
  });
}

/** V2: liberado só com bruto da ficha; valor = % configurada × bruto (cap pelo teto). */
export async function resolveHbV2FichaLimiteExibicao(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string,
  limite: ContaCoopLimiteCooperado,
  brutoFichaCents: number
): Promise<{ limite: ContaCoopLimiteCooperado; exibicao: HbV2FichaLimiteExibicao }> {
  const bruto = Math.max(0, Math.round(brutoFichaCents));
  if (bruto <= 0) {
    return {
      limite: limiteExibicaoV2SemBrutoFicha(limite),
      exibicao: { valorLiberadoCents: 0, liberacaoPercent: null },
    };
  }

  const bases = { [cooperadoId]: bruto };
  const teto = await resolveTetoGlobal(supabase, cnpj, bases);
  const tetoPercent = teto.configured ? teto.percent : 0;
  if (!tetoPercent || tetoPercent <= 0) {
    return {
      limite: limiteExibicaoV2SemBrutoFicha(limite),
      exibicao: { valorLiberadoCents: 0, liberacaoPercent: null },
    };
  }

  const liberacaoPercent = await getCooperativaLiberacaoPercentConfigured(supabase, cnpj);
  const capped = capLimiteContaCoopV2FichaBruto(limite, bruto, tetoPercent, liberacaoPercent);
  const libPct =
    liberacaoPercent != null && liberacaoPercent > 0
      ? Math.min(tetoPercent, liberacaoPercent)
      : tetoPercent;

  return {
    limite: capped,
    exibicao: {
      valorLiberadoCents: Math.max(0, capped.limiteLiberadoCents ?? 0),
      liberacaoPercent: libPct,
    },
  };
}
