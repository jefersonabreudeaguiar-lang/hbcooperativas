/**
 * Índices cacheados por revisão do AppData — painel responsável (fila, dashboard).
 * Read-only; não altera lançamentos.
 */
import type { AppData, Cooperado, NotaPedido } from "@/types";
import { cooperadoPendentePagamentoResponsavel } from "@/services/cooperadoEntregasService";
import { listCooperadosDaCooperativa } from "@/services/cooperadoCloudService";
import { getDataRevision } from "@/services/dataStore";
import { idsNotasPedidoExcluidas } from "@/services/notaPedidoService";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { isNotaNaFilaConferenciaResponsavel } from "@/utils/notaStatus";

type PainelCache = {
  revision: number;
  coopId: string;
  filaNotas: NotaPedido[];
  cooperadosPagar: Cooperado[];
  cooperadosPagarCount: number;
};

let painelCache: PainelCache | null = null;

function cooperadoIdsDaCooperativa(data: AppData, coopId: string): Set<string> {
  const ids = new Set<string>();
  for (const c of data.cooperados) {
    if (c.cooperativaId === coopId) ids.add(c.id);
  }
  return ids;
}

function candidatosCooperadoPagamento(data: AppData, coopId: string): Set<string> {
  const coopIds = cooperadoIdsDaCooperativa(data, coopId);
  const candidatos = new Set<string>();
  for (const f of data.fichaCorrida) {
    if (!coopIds.has(f.cooperadoId)) continue;
    if (f.status === "pendente" || f.status === "pago") candidatos.add(f.cooperadoId);
  }
  for (const p of data.pagamentosCooperado) {
    if (p.cooperativaId !== coopId) continue;
    if (p.status === "aguardando_confirmacao" || p.status === "confirmado") {
      candidatos.add(p.cooperadoId);
    }
  }
  for (const v of data.valoresAvulsosReceber) {
    if (v.cooperativaId !== coopId) continue;
    if (!coopIds.has(v.cooperadoId)) continue;
    if (v.status === "pendente") candidatos.add(v.cooperadoId);
  }
  return candidatos;
}

function buildPainelCache(data: AppData, coopId: string): PainelCache {
  const excluidas = idsNotasPedidoExcluidas(data, coopId);
  const filaNotas: NotaPedido[] = [];
  for (const n of data.notasPedido) {
    if (!isNotaNaFilaConferenciaResponsavel(n.status)) continue;
    if (!notaPertenceCooperativa(data, n, coopId)) continue;
    if (excluidas.has(n.id)) continue;
    filaNotas.push(n);
  }
  filaNotas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const candidatos = candidatosCooperadoPagamento(data, coopId);
  const cooperadosPagar: Cooperado[] = [];
  if (candidatos.size > 0) {
    for (const c of listCooperadosDaCooperativa(data, coopId)) {
      if (!candidatos.has(c.id)) continue;
      if (cooperadoPendentePagamentoResponsavel(data, c.id, undefined, coopId)) {
        cooperadosPagar.push(c);
      }
    }
  }

  return {
    revision: getDataRevision(),
    coopId,
    filaNotas,
    cooperadosPagar,
    cooperadosPagarCount: cooperadosPagar.length,
  };
}

function getPainelCache(data: AppData, coopId: string): PainelCache {
  const revision = getDataRevision();
  if (painelCache && painelCache.revision === revision && painelCache.coopId === coopId) {
    return painelCache;
  }
  painelCache = buildPainelCache(data, coopId);
  return painelCache;
}

/** Notas na fila de conferência do responsável (uma passagem + cache por revisão). */
export function listNotasFilaConferenciaResponsavel(data: AppData, coopId: string): NotaPedido[] {
  if (!coopId) return [];
  return getPainelCache(data, coopId).filaNotas;
}

export function countNotasFilaConferenciaResponsavel(data: AppData, coopId: string): number {
  if (!coopId) return 0;
  return getPainelCache(data, coopId).filaNotas.length;
}

export function listCooperadosPagamentoPendenteResponsavel(data: AppData, coopId: string): Cooperado[] {
  if (!coopId) return [];
  return getPainelCache(data, coopId).cooperadosPagar;
}

export function countCooperadosPagamentoPendenteResponsavel(data: AppData, coopId: string): number {
  if (!coopId) return 0;
  return getPainelCache(data, coopId).cooperadosPagarCount;
}

/** Invalida cache (testes). */
export function resetResponsavelPainelIndexCache(): void {
  painelCache = null;
}
