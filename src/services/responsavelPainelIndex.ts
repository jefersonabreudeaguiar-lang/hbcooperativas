/**
 * Índices cacheados por revisão do AppData — painel responsável (fila, dashboard).
 * Read-only; não altera lançamentos.
 */
import type { AppData, Cooperado, NotaPedido } from "@/types";
import { cooperadoPendentePagamentoResponsavel } from "@/services/cooperadoEntregasService";
import {
  fichaPertenceCooperado,
  listCooperadosDaCooperativa,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { getDataOperationalTruth, getDataRevision } from "@/services/dataStore";
import { listarMesesFichaEmAbertoCooperado } from "@/lib/hb-credit/hbCreditCreditoBaseCalculo";
import { idsNotasPedidoExcluidas } from "@/services/notaPedidoService";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { notaElegivelParaFilaConferenciaResponsavel, sanitizarNotaParaFilaConferencia } from "@/utils/notaStatus";
import {
  getRelatorioPagarCooperadoEmAberto,
  type LinhaPagarCooperadoEmAberto,
} from "@/services/relatorioService";
import { anotarLinhasEmAbertoComBic } from "@/lib/bic/anotarLinhasEmAbertoComBic";

type PainelCache = {
  revision: number;
  coopId: string;
  filaNotas: NotaPedido[];
  cooperadosPagar: Cooperado[];
  cooperadosPagarCount: number;
};

let painelCache: PainelCache | null = null;

type RelatorioAbertoCache = {
  revision: number;
  coopId: string;
  linhas: LinhaPagarCooperadoEmAberto[];
};

let relatorioAbertoCache: RelatorioAbertoCache | null = null;
let relatorioAbertoLatch: { coopId: string; linhas: LinhaPagarCooperadoEmAberto[] } | null = null;
let conferirLeituraLatch: AppData | null = null;

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
  for (const f of data.fichaCorrida ?? []) {
    if (!coopIds.has(f.cooperadoId)) continue;
    if (f.status === "pendente" || f.status === "pago") candidatos.add(f.cooperadoId);
  }
  for (const p of data.pagamentosCooperado ?? []) {
    if (p.cooperativaId !== coopId) continue;
    if (p.status === "aguardando_confirmacao" || p.status === "confirmado") {
      candidatos.add(p.cooperadoId);
    }
  }
  for (const v of data.valoresAvulsosReceber ?? []) {
    if (v.cooperativaId !== coopId) continue;
    if (!coopIds.has(v.cooperadoId)) continue;
    if (v.status === "pendente") candidatos.add(v.cooperadoId);
  }
  return candidatos;
}

function mergeNotasPedidoParaPainel(truth: NotaPedido[], react: NotaPedido[]): NotaPedido[] {
  if (react.length === 0) return truth;
  if (truth.length === 0) return react;
  const byId = new Map<string, NotaPedido>();
  for (const n of truth) byId.set(n.id, n);
  for (const n of react) byId.set(n.id, n);
  return [...byId.values()];
}

function scoreSnapshotConferir(d: AppData): { fichas: number; notas: number; cooperados: number; pix: number } {
  let pix = 0;
  for (const p of d.pagamentosCooperado ?? []) {
    if (p.status === "confirmado") pix += 1;
  }
  return {
    fichas: d.fichaCorrida?.length ?? 0,
    notas: d.notasPedido?.length ?? 0,
    cooperados: d.cooperados?.length ?? 0,
    pix,
  };
}

/** Snapshot incompleto (sync/push) não substitui o último completo sem prova de PIX. */
export function snapshotConferirPoorerSemProva(next: AppData, prev: AppData): boolean {
  const n = scoreSnapshotConferir(next);
  const p = scoreSnapshotConferir(prev);
  if (n.cooperados === 0 && p.cooperados > 0) return true;
  if (n.notas === 0 && p.notas > 0 && n.pix <= p.pix) return true;
  if (n.fichas === 0 && p.fichas > 0 && n.pix <= p.pix) return true;
  if (n.fichas < p.fichas && n.pix <= p.pix) return true;
  return false;
}

function escolherSnapshotMaisCompleto(truth: AppData, data: AppData): AppData {
  if (truth === data) return data;
  const t = scoreSnapshotConferir(truth);
  const d = scoreSnapshotConferir(data);
  const truthRicher =
    t.fichas > d.fichas ||
    (t.fichas === d.fichas && (t.notas > d.notas || (t.notas === d.notas && t.cooperados > d.cooperados)));
  const base = truthRicher ? truth : data;
  const other = base === truth ? data : truth;
  const notasPedido = mergeNotasPedidoParaPainel(base.notasPedido, other.notasPedido);
  if (notasPedido === base.notasPedido) return base;
  return { ...base, notasPedido };
}

function aplicarLastroCompletenessConferir(candidato: AppData): AppData {
  const prev = conferirLeituraLatch;
  if (!prev || !snapshotConferirPoorerSemProva(candidato, prev)) {
    conferirLeituraLatch = candidato;
    return candidato;
  }
  return prev;
}

/**
 * Foto única da aba Conferir: verdade operacional + merge de notas, com lastro de completeness.
 * O filtro de push em `getData()` não alimenta a tela.
 */
export function appDataParaConferirLeitura(data: AppData): AppData {
  const truth = getDataOperationalTruth();
  return aplicarLastroCompletenessConferir(escolherSnapshotMaisCompleto(truth, data));
}

/** Só sai da lista em aberto com PIX confirmado e ficha ainda presente (sync incompleto não apaga). */
export function cooperadoEmAbertoPodeSair(
  data: AppData,
  cooperadoId: string,
  coopId: string
): boolean {
  if (!cooperadoId || !coopId) return false;
  const aberto = listarMesesFichaEmAbertoCooperado(data, cooperadoId, coopId);
  if (aberto.total > 0.005) return false;
  const temFicha = (data.fichaCorrida ?? []).some((f) =>
    fichaPertenceCooperado(data, f, cooperadoId, coopId)
  );
  if (!temFicha) return false;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  return (data.pagamentosCooperado ?? []).some((p) => {
    if (p.status !== "confirmado") return false;
    if (p.cooperativaId && p.cooperativaId !== coopId) return false;
    if (p.cooperadoId === cooperadoId || p.cooperadoId === canonico) return true;
    return resolverCooperadoIdCanonico(data, p.cooperadoId, p.cooperativaId ?? coopId) === canonico;
  });
}

/** Mantém cooperados já vistos até quitação real — sync/conferência não zera a lista. */
export function fundirLinhasEmAbertoEstavel(
  anterior: LinhaPagarCooperadoEmAberto[],
  motor: LinhaPagarCooperadoEmAberto[],
  data: AppData,
  coopId: string
): LinhaPagarCooperadoEmAberto[] {
  if (anterior.length === 0) return motor;
  const byId = new Map(motor.map((l) => [l.cooperadoId, l]));
  for (const old of anterior) {
    if (byId.has(old.cooperadoId)) continue;
    if (!cooperadoEmAbertoPodeSair(data, old.cooperadoId, coopId)) {
      byId.set(old.cooperadoId, old);
    }
  }
  return [...byId.values()].sort((a, b) => a.cooperado.localeCompare(b.cooperado, "pt-BR"));
}

function buildPainelCache(data: AppData, coopId: string): PainelCache {
  const excluidas = idsNotasPedidoExcluidas(data, coopId);
  const filaNotas: NotaPedido[] = [];
  for (const n of data.notasPedido ?? []) {
    const candidata = sanitizarNotaParaFilaConferencia(n);
    if (!notaElegivelParaFilaConferenciaResponsavel(candidata)) continue;
    if (!notaPertenceCooperativa(data, n, coopId)) continue;
    if (excluidas.has(n.id)) continue;
    filaNotas.push(candidata);
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
  painelCache = buildPainelCache(appDataParaConferirLeitura(data), coopId);
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

/** Relatório «Em aberto» cacheado por revisão (evita recomputar a cada clique de aba). */
export function getRelatorioLancamentosEmAbertoResponsavel(
  data: AppData,
  coopId: string,
  cooperadoId?: string
): LinhaPagarCooperadoEmAberto[] {
  if (!coopId) return [];
  const dataAberto = appDataParaConferirLeitura(data);
  if (cooperadoId) {
    return anotarLinhasEmAbertoComBic(
      dataAberto,
      getRelatorioPagarCooperadoEmAberto(dataAberto, coopId, cooperadoId),
      coopId
    );
  }
  const revision = getDataRevision();
  if (
    relatorioAbertoCache &&
    relatorioAbertoCache.revision === revision &&
    relatorioAbertoCache.coopId === coopId
  ) {
    return relatorioAbertoCache.linhas;
  }
  const motor = getRelatorioPagarCooperadoEmAberto(dataAberto, coopId);
  const anterior =
    relatorioAbertoLatch && relatorioAbertoLatch.coopId === coopId ? relatorioAbertoLatch.linhas : [];
  const linhas = anotarLinhasEmAbertoComBic(
    dataAberto,
    fundirLinhasEmAbertoEstavel(anterior, motor, dataAberto, coopId),
    coopId
  );
  relatorioAbertoLatch = { coopId, linhas };
  relatorioAbertoCache = { revision, coopId, linhas };
  return linhas;
}

export function countCooperadosLancamentosEmAbertoResponsavel(data: AppData, coopId: string): number {
  return getRelatorioLancamentosEmAbertoResponsavel(data, coopId).length;
}

/** Invalida cache (testes). */
export function resetResponsavelPainelIndexCache(): void {
  painelCache = null;
  relatorioAbertoCache = null;
  relatorioAbertoLatch = null;
  conferirLeituraLatch = null;
}
