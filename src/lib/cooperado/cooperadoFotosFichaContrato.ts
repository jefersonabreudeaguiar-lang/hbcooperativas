/**
 * Contrato das fotos do cooperado — não voltar ao modelo antigo sem bump.
 *
 * v2: Ficha = extrato completo (todos os meses). Fotos por mês = todas as fotos,
 * uma sanfona por mês, ampliar e passar na sequência.
 * Financeiro: aba "Foto a receber" = só mês em aberto.
 */
import type { AppData } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  getResumoMesEntregasCooperado,
  listarMesesEmAbertoPagamentoResponsavel,
  listarResumosExtratoHistoricoCooperado,
  listarResumosFotosCooperado,
  listarResumosMensaisEntregas,
  notaTemFotoEnviadaCooperado,
} from "@/services/cooperadoEntregasService";
import {
  listarMesesTimelineFichaCooperado,
  listarResumosFichaEmAbertoCooperado,
} from "@/services/cooperadoFichaTimelineService";

export const COOPERADO_FOTOS_FICHA_CONTRATO_VERSION = 2;

export const COOPERADO_FINANCEIRO_FOTO_A_RECEBER_SECAO = "fotos" as const;
export const COOPERADO_FINANCEIRO_FOTO_A_RECEBER_LABEL = "Foto a receber";
export const COOPERADO_FICHA_FOTOS_LIQUIDADAS_LABEL = "Fotos por mês";

export function mesesReferenciaAbertoParaFotos(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  mesesAbertoExtra: readonly string[] = []
): Set<string> {
  const abertos = new Set(mesesAbertoExtra);
  for (const mes of listarMesesEmAbertoPagamentoResponsavel(data, cooperadoId, cooperativaId)) {
    abertos.add(mes);
  }
  for (const r of listarResumosFichaEmAbertoCooperado(data, cooperadoId, cooperativaId)) {
    abertos.add(r.mesReferencia);
  }
  return abertos;
}

export function particionarResumosFotosPorAberto(
  todos: ResumoMesEntregasCooperado[],
  mesesAbertos: ReadonlySet<string>
): {
  aReceber: ResumoMesEntregasCooperado[];
  fichaLiquidada: ResumoMesEntregasCooperado[];
} {
  const aReceber: ResumoMesEntregasCooperado[] = [];
  const fichaLiquidada: ResumoMesEntregasCooperado[] = [];
  for (const r of todos) {
    if (mesesAbertos.has(r.mesReferencia)) aReceber.push(r);
    else fichaLiquidada.push(r);
  }
  return { aReceber, fichaLiquidada };
}

export function listarResumosFotosAReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  mesesAbertoExtra: readonly string[] = []
): ResumoMesEntregasCooperado[] {
  const abertos = mesesReferenciaAbertoParaFotos(data, cooperadoId, cooperativaId, mesesAbertoExtra);
  return particionarResumosFotosPorAberto(
    listarResumosFotosCooperado(data, cooperadoId, cooperativaId),
    abertos
  ).aReceber;
}

export function listarResumosFotosFichaLiquidada(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  mesesAbertoExtra: readonly string[] = []
): ResumoMesEntregasCooperado[] {
  const abertos = mesesReferenciaAbertoParaFotos(data, cooperadoId, cooperativaId, mesesAbertoExtra);
  return particionarResumosFotosPorAberto(
    listarResumosFotosCooperado(data, cooperadoId, cooperativaId),
    abertos
  ).fichaLiquidada;
}

export function mesclarResumosFichaComMesesAnteriores(
  abertos: ResumoMesEntregasCooperado[],
  historico: ResumoMesEntregasCooperado[]
): ResumoMesEntregasCooperado[] {
  const byMes = new Map<string, ResumoMesEntregasCooperado>();
  for (const r of historico) byMes.set(r.mesReferencia, r);
  for (const r of abertos) byMes.set(r.mesReferencia, r);
  return [...byMes.values()].sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));
}

export function listarResumosFichaComMesesAnteriores(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  return mesclarResumosFichaComMesesAnteriores(
    listarResumosFichaEmAbertoCooperado(data, cooperadoId, cooperativaId),
    listarResumosExtratoHistoricoCooperado(data, cooperadoId, cooperativaId)
  );
}

/** Ficha completa — todos os meses com entrega, ficha, PIX ou foto. */
export function listarResumosFichaCompletaCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  const byMes = new Map<string, ResumoMesEntregasCooperado>();
  for (const mes of listarMesesTimelineFichaCooperado(data, cooperadoId, cooperativaId)) {
    byMes.set(mes, getResumoMesEntregasCooperado(data, cooperadoId, mes, cooperativaId));
  }
  for (const r of listarResumosMensaisEntregas(data, cooperadoId, cooperativaId)) {
    const prev = byMes.get(r.mesReferencia);
    if (!prev || r.notas.length > prev.notas.length) byMes.set(r.mesReferencia, r);
  }
  for (const r of listarResumosFichaComMesesAnteriores(data, cooperadoId, cooperativaId)) {
    if (!byMes.has(r.mesReferencia)) byMes.set(r.mesReferencia, r);
  }
  return [...byMes.values()]
    .filter((r) => r.notas.length > 0 || r.valorAReceber > 0.005 || r.valorRecebido > 0.005)
    .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));
}

/** Todas as fotos do cooperado, um resumo por mês — aba Fotos por mês. */
export function listarResumosFotosFichaTodas(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMesEntregasCooperado[] {
  return listarResumosFotosCooperado(data, cooperadoId, cooperativaId);
}

export function resumosFotosAPartirDeResumos(
  resumos: ResumoMesEntregasCooperado[]
): ResumoMesEntregasCooperado[] {
  return resumos
    .map((r) => ({
      ...r,
      notas: r.notas.filter((n) => notaTemFotoEnviadaCooperado(n)),
    }))
    .filter((r) => r.notas.length > 0);
}

/** Junta lastros da Ficha (AppData, snapshot Entregas, snapshot Financeiro). */
export function mesclarResumosFichaCompletaFontes(
  ...fontes: Array<readonly ResumoMesEntregasCooperado[] | undefined | null>
): ResumoMesEntregasCooperado[] {
  const byMes = new Map<string, ResumoMesEntregasCooperado>();
  for (const lista of fontes) {
    for (const r of lista ?? []) {
      const prev = byMes.get(r.mesReferencia);
      if (!prev || r.notas.length > prev.notas.length) byMes.set(r.mesReferencia, r);
    }
  }
  return [...byMes.values()].sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));
}
