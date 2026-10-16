/**
 * Concerto BIC — Movimento I: maestro de leitura financeira.
 * Uma porta por superfície; motores legados ficam atrás dos wrappers (nunca na UI nova).
 */
import type { AppData } from "@/types";
import { isCooperadoFinanceiroAppDataLiveRead } from "@/lib/cooperado/cooperadoFinanceiroAppDataLiveRead";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import {
  isBicLeituraPortaAtiva,
  type BicLeituraSuperficie,
} from "@/lib/bic/bicLeituraPortaGating";
import {
  leituraFinanceiraParidadeCooperado,
  type LeituraFinanceiraParidadeCooperado,
} from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import {
  bicCentralLeituraFinanceiraParidadeCooperado,
  type BicCentralProjecaoOpts,
} from "@/services/bicLeituraCentralCooperado";

export type BicLeituraPortaCooperadoOpts = Pick<BicCentralProjecaoOpts, "apresentacaoConsolidada">;

export type BicLeituraPortaEnvelope<T> = {
  value: T;
  meta: {
    superficie: BicLeituraSuperficie;
    viaPorta: boolean;
    bicAuthority: boolean;
    appDataLive: boolean;
  };
};

function envelope<T>(
  superficie: BicLeituraSuperficie,
  value: T,
  viaPorta: boolean
): BicLeituraPortaEnvelope<T> {
  return {
    value,
    meta: {
      superficie,
      viaPorta,
      bicAuthority: isBicCentralReadAuthorityEnabled(),
      appDataLive: isCooperadoFinanceiroAppDataLiveRead(),
    },
  };
}

/** Caminho interno compartilhado — mesma regra que `cooperadoLeituraFinanceiraExibicao` pré-porta. */
export function resolveLeituraFinanceiraCooperadoCore(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  opts?: BicLeituraPortaCooperadoOpts
): LeituraFinanceiraParidadeCooperado {
  if (!isCooperadoFinanceiroAppDataLiveRead() && isBicCentralReadAuthorityEnabled()) {
    return bicCentralLeituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId, opts);
  }
  return leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
}

/**
 * Cooperado — início, ficha, snapshots, HB cruzado.
 * Com `isBicLeituraPortaAtiva('cooperado')` a UI pode inspecionar `meta`; o valor é idêntico ao core.
 */
export function leituraCooperadoFinanceira(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  opts?: BicLeituraPortaCooperadoOpts
): BicLeituraPortaEnvelope<LeituraFinanceiraParidadeCooperado> {
  const viaPorta = isBicLeituraPortaAtiva("cooperado");
  const value = resolveLeituraFinanceiraCooperadoCore(data, cooperadoId, cooperativaId, opts);
  return envelope("cooperado", value, viaPorta);
}

/**
 * Staff / responsável — totais do cooperado na fila (mesma paridade BIC do cooperado).
 * Rollback: `NEXT_PUBLIC_BIC_LEITURA_PORTA_STAFF=false`.
 */
export function leituraStaffCooperadoFinanceira(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  opts?: BicLeituraPortaCooperadoOpts
): BicLeituraPortaEnvelope<LeituraFinanceiraParidadeCooperado> {
  const viaPorta = isBicLeituraPortaAtiva("staff");
  const value = viaPorta
    ? resolveLeituraFinanceiraCooperadoCore(data, cooperadoId, cooperativaId, opts)
    : leituraFinanceiraParidadeCooperado(data, cooperadoId, cooperativaId);
  return envelope("staff", value, viaPorta);
}

export type BicLeituraHbCreditoResumo = {
  valorAReceber: number;
  mesPrincipal: string;
  mesesAbertos: string[];
};

/**
 * HB Créditos — lastro e limite leem o mesmo agregado BIC (lazy require evita ciclo no client).
 */
export function leituraHbCreditoFinanceira(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): BicLeituraPortaEnvelope<BicLeituraHbCreditoResumo> {
  const viaPorta = isBicLeituraPortaAtiva("hb_credito");
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;

  if (!viaPorta) {
    const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, coopId);
    const meses = paridade.mesesResumo;
    return envelope("hb_credito", {
      valorAReceber: paridade.valorLiquido,
      mesPrincipal: meses.length ? meses[meses.length - 1]! : "",
      mesesAbertos: [...meses],
    }, false);
  }

  const { hbCreditValorAReceberAgregado, hbCreditMesPrincipal, hbCreditMesesReferenciaUnificados } =
    require("@/lib/hb-credit/hbCreditLeituraBic") as typeof import("@/lib/hb-credit/hbCreditLeituraBic");

  const agregado = hbCreditValorAReceberAgregado(data, cooperadoId, coopId);
  const mesPrincipal =
    coopId != null
      ? hbCreditMesPrincipal(data, cooperadoId, coopId)
      : hbCreditMesPrincipal(data, cooperadoId, undefined);
  const mesesAbertos =
    coopId != null
      ? hbCreditMesesReferenciaUnificados(data, cooperadoId, coopId, mesPrincipal)
      : [];

  return envelope("hb_credito", {
    valorAReceber: agregado.valor > 0.005 ? agregado.valor : 0,
    mesPrincipal,
    mesesAbertos,
  }, true);
}
