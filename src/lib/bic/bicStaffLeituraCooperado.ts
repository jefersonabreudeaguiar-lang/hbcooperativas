/**
 * Concerto BIC — Movimento III: leitura staff com memo barato por cooperado + revisão de domínio.
 */
import type { AppData } from "@/types";
import {
  getAppDataDomainRevision,
  type AppDataNotifyDomain,
} from "@/lib/performance/appDataDomainNotify";
import { isBicLeituraPortaAtiva } from "@/lib/bic/bicLeituraPortaGating";
import { leituraStaffCooperadoFinanceira } from "@/lib/bic/bicLeituraPorta";
import type { LeituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import {
  bicCentralListarResumosMensaisEntregas,
  bicCentralMesPrincipalQuantoVouReceber,
} from "@/services/bicLeituraCentralCooperado";
import { listarResumosFichaEmAbertoCooperado } from "@/services/cooperadoFichaTimelineService";

const STAFF_DOMAINS: AppDataNotifyDomain[] = ["shell", "financeiro", "notas"];

function staffDomainRevisionKey(): string {
  return STAFF_DOMAINS.map((d) => getAppDataDomainRevision(d)).join(",");
}

type MemoEntry = { rev: string; value: LeituraFinanceiraParidadeCooperado };
const paridadeMemo = new Map<string, MemoEntry>();

function memoKey(cooperadoId: string, cooperativaId: string | undefined): string {
  return `${cooperadoId}:${cooperativaId ?? ""}`;
}

/** Paridade BIC para fila / painel responsável (flag `NEXT_PUBLIC_BIC_LEITURA_PORTA_STAFF`). */
export function staffCooperadoLeituraFinanceiraExibicao(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): LeituraFinanceiraParidadeCooperado {
  if (!isBicLeituraPortaAtiva("staff")) {
    return leituraStaffCooperadoFinanceira(data, cooperadoId, cooperativaId).value;
  }
  const key = memoKey(cooperadoId, cooperativaId);
  const rev = staffDomainRevisionKey();
  const hit = paridadeMemo.get(key);
  if (hit && hit.rev === rev) return hit.value;
  const value = leituraStaffCooperadoFinanceira(data, cooperadoId, cooperativaId).value;
  paridadeMemo.set(key, { rev, value });
  return value;
}

export function staffMesPrincipalQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string {
  if (!isBicLeituraPortaAtiva("staff")) {
    return bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
  }
  const paridade = staffCooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId);
  const meses = paridade.mesesResumo;
  if (meses.length) return meses[meses.length - 1]!;
  return bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
}

export function staffListarResumosMensaisEntregas(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
) {
  return bicCentralListarResumosMensaisEntregas(data, cooperadoId, cooperativaId);
}

/** Ficha em aberto do staff — mesma porta BIC no valor, lista operacional. */
export function staffListarResumosFichaEmAberto(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
) {
  const resumos = listarResumosFichaEmAbertoCooperado(data, cooperadoId, cooperativaId);
  if (resumos.length === 0) return resumos;
  const bic = staffCooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId);
  if (!(bic.valorLiquido > 0.005)) return resumos;
  if (resumos.length === 1) {
    return [{ ...resumos[0]!, valorAReceber: bic.valorLiquido }];
  }
  return resumos;
}

export function resetBicStaffLeituraMemoForTests(): void {
  paridadeMemo.clear();
}
