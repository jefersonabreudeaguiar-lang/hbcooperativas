import type {
  AppData,
  NotaPedido,
  NotaPedidoItem,
  FichaCorrida,
  FichaCorridaDesconto,
  PagamentoCooperadoRegistro,
  ArquivoMensalCooperado,
  AjustesFichaMesCooperativa,
  Comunicado,
  DivisaoEntregaNota,
  NotaPedidoExcluida,
} from "@/types";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  listCooperadosDaCooperativa,
  resolverCooperadoIdCanonico,
  getCooperadoNomeResolvido,
} from "@/services/cooperadoCloudService";
import { descontosDoCooperadoNoMes, descontoManualDuplicaContaCoop } from "@/services/descontosService";
import { valoresAvulsosPendentesMes, marcarValoresAvulsosPagosMes } from "@/services/valoresAvulsosReceberService";
import { round2 } from "@/utils/calculations";
import { gerarReciboHtml, resumoReciboFromPagamento } from "@/utils/recibo";
import { lancarPagamentoCooperadoNoCaixa } from "@/services/livroCaixaService";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import {
  descontosContaCoopFromArquivo,
  dedupeDescontosContaCoopRemotos,
  dedupeDescontosExtrasContaCoop,
  filtrarDescontosContaCoopParaMesReferencia,
  mergeDescontosContaCoopNoResumo,
} from "@/lib/hb-credit/mergeFichaDescontos";
import { formatMesesReferenciaRotulo } from "@/utils/format";
import { fichaPreservarSemNotaLocal, notasSyncProvavelmenteCompleto } from "@/services/fichaSyncGuard";
import { isCloudSyncInProgress } from "@/services/cloudSyncProgress";
import { contarFotosEnviadasNota } from "@/utils/fotoEntrega";

export interface ItemResumoFichaMes {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
  valorBruto: number;
}

export type AgregarItensFichaOpts = {
  /** Alinha tabela de itens ao resumo de pagamento (só fichas pendentes). */
  apenasPendentes?: boolean;
};

/** Valor da linha = quantidade × preço (mesma regra de calcularItensNota e relatórios). */
function valorBrutoItemLinha(item: NotaPedidoItem): number {
  return round2(item.quantidade * item.precoUnitario);
}

function mesclarItemResumo(map: Map<string, ItemResumoFichaMes>, item: NotaPedidoItem) {
  if (item.quantidade <= 0) return;
  const valorLinha = valorBrutoItemLinha(item);
  const key = item.produtoInstituicaoId || `${item.produtoNome.trim()}::${item.unidade.trim()}`;
  const existente = map.get(key);
  if (existente) {
    existente.quantidade = round2(existente.quantidade + item.quantidade);
    existente.valorBruto = round2(existente.valorBruto + valorLinha);
    existente.precoUnitario =
      existente.quantidade > 0 ? round2(existente.valorBruto / existente.quantidade) : item.precoUnitario;
  } else {
    map.set(key, {
      produtoInstituicaoId: item.produtoInstituicaoId,
      produtoNome: item.produtoNome,
      unidade: item.unidade,
      precoUnitario: item.precoUnitario,
      quantidade: item.quantidade,
      valorBruto: valorLinha,
    });
  }
}

/** Soma itens de todas as entregas do cooperado no mês (ficha corrida consolidada). */
export function agregarItensFichaMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string,
  opts?: AgregarItensFichaOpts
): { itens: ItemResumoFichaMes[]; entregas: number; valorBruto: number } {
  const fichas = opts?.apenasPendentes
    ? listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, cooperativaId)
    : listarFichasExtratoCooperadoMes(data, cooperadoId, mesReferencia, cooperativaId);

  const map = new Map<string, ItemResumoFichaMes>();
  for (const ficha of fichas) {
    for (const item of ficha.itens ?? []) {
      mesclarItemResumo(map, item);
    }
  }

  const itens = [...map.values()].sort((a, b) =>
    a.produtoNome.localeCompare(b.produtoNome, "pt-BR")
  );
  const valorBruto = round2(itens.reduce((s, i) => s + i.valorBruto, 0));

  return { itens, entregas: fichas.length, valorBruto };
}

/** Consolida itens de vários meses (pagamento único). */
export function agregarItensFichaMeses(
  data: AppData,
  cooperadoId: string,
  mesesReferencia: string[],
  cooperativaId?: string,
  opts?: AgregarItensFichaOpts
): { itens: ItemResumoFichaMes[]; entregas: number; valorBruto: number } {
  const map = new Map<string, ItemResumoFichaMes>();
  let entregas = 0;
  for (const mes of mesesReferencia) {
    const parcial = agregarItensFichaMes(data, cooperadoId, mes, cooperativaId, opts);
    entregas += parcial.entregas;
    for (const item of parcial.itens) {
      const key = item.produtoInstituicaoId || `${item.produtoNome.trim()}::${item.unidade.trim()}`;
      const existente = map.get(key);
      if (existente) {
        existente.quantidade = round2(existente.quantidade + item.quantidade);
        existente.valorBruto = round2(existente.valorBruto + item.valorBruto);
        existente.precoUnitario =
          existente.quantidade > 0 ? round2(existente.valorBruto / existente.quantidade) : item.precoUnitario;
      } else {
        map.set(key, { ...item });
      }
    }
  }
  const itens = [...map.values()].sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
  const valorBruto = round2(itens.reduce((s, i) => s + i.valorBruto, 0));
  return { itens, entregas, valorBruto };
}

/** Itens conferidos do cooperado nas notas (usa ficha dividida quando existir). */
export function agregarItensNotasCooperado(
  data: AppData,
  cooperadoId: string,
  notas: NotaPedido[],
  cooperativaId?: string
): NotaPedidoItem[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const map = new Map<string, NotaPedidoItem>();

  for (const nota of notas) {
    if (nota.status !== "conferida" && nota.status !== "pago") continue;
    if (!notaPertenceCooperado(data, nota, cooperadoId, coopId)) continue;

    const fichas = dedupeFichaCorridaPorNota(
      data.fichaCorrida.filter(
        (f) =>
          f.notaPedidoId === nota.id &&
          fichaPertenceCooperado(data, f, cooperadoId, coopId) &&
          fichaValidaNoExtrato(data, f)
      ),
      data.notasPedido
    );

    let itensFonte: NotaPedidoItem[];
    if (fichas.length > 0) {
      itensFonte = fichas.flatMap((f) => f.itens ?? []);
    } else if ((nota.divisaoEntrega?.participantes.length ?? 0) > 1) {
      continue;
    } else {
      itensFonte = nota.itens ?? [];
    }

    for (const item of itensFonte) {
      if (item.quantidade <= 0) continue;
      const key = item.produtoInstituicaoId || `${item.produtoNome.trim()}::${item.unidade.trim()}`;
      const valorLinha = valorBrutoItemLinha(item);
      const existente = map.get(key);
      if (existente) {
        existente.quantidade = round2(existente.quantidade + item.quantidade);
        existente.valorBruto = round2(existente.valorBruto + valorLinha);
      } else {
        map.set(key, { ...item, valorBruto: valorLinha });
      }
    }
  }

  return [...map.values()].sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
}

export function calcularItensNota(
  itens: NotaPedidoItem[],
  percentualDesconto: number
): { itens: NotaPedidoItem[]; valorBruto: number; valorDesconto: number; valorLiquido: number } {
  const calculados = itens
    .filter((i) => i.quantidade > 0)
    .map((i) => ({
      ...i,
      valorBruto: round2(i.quantidade * i.precoUnitario),
    }));

  const valorBruto = round2(calculados.reduce((s, i) => s + i.valorBruto, 0));
  // Desconto por linha (soma arredondada) — bate com a soma das fichas multi-foto.
  const valorDesconto = round2(
    calculados.reduce((s, i) => s + round2(i.valorBruto * (percentualDesconto / 100)), 0)
  );
  const valorLiquido = round2(valorBruto - valorDesconto);

  return { itens: calculados, valorBruto, valorDesconto, valorLiquido };
}

export function gerarNumeroNota(data: AppData, cooperativaId: string): string {
  const count = data.notasPedido.filter((n) => n.cooperativaId === cooperativaId).length + 1;
  const ano = new Date().getFullYear();
  return `${ano}-${String(count).padStart(4, "0")}`;
}

/** Normaliza número informado na conferência (ex.: "01" e "1" equivalem). */
export function normalizarNumeroNotaConferencia(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return String(parseInt(trimmed, 10));
  return trimmed.toLowerCase();
}

/** Verifica duplicidade de número já conferido/lançado para o mesmo cooperado (não global). */
export function isNumeroNotaJaConferidaParaCooperado(
  data: AppData,
  params: {
    cooperadoId: string;
    cooperativaId: string;
    numeroNota: string;
    excludeNotaId?: string;
  }
): boolean {
  const alvo = normalizarNumeroNotaConferencia(params.numeroNota);
  if (!alvo) return false;

  const cooperadoCanonico = resolverCooperadoIdCanonico(
    data,
    params.cooperadoId,
    params.cooperativaId
  );

  return data.notasPedido.some((nota) => {
    if (params.excludeNotaId && nota.id === params.excludeNotaId) return false;
    if (nota.cooperativaId !== params.cooperativaId) return false;
    if (nota.status !== "conferida" && nota.status !== "pago") return false;

    const notaCooperadoId = resolverCooperadoIdCanonico(
      data,
      nota.cooperadoId,
      params.cooperativaId,
      nota.cooperadoNomeSnapshot
    );
    if (notaCooperadoId !== cooperadoCanonico) return false;

    const existente = normalizarNumeroNotaConferencia(nota.numeroNota);
    return Boolean(existente && existente === alvo);
  });
}

export function getSaldoAnteriorFicha(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  excludeNotaId?: string
): number {
  const entries = data.fichaCorrida
    .filter((f) => f.cooperadoId === cooperadoId && f.mesReferencia === mesReferencia && f.notaPedidoId !== excludeNotaId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return entries.length ? entries[entries.length - 1].saldoAcumulado : 0;
}

export function getMensalidadesPendentesMes(data: AppData, cooperadoId: string, mesReferencia: string): FichaCorridaDesconto[] {
  return data.mensalidades
    .filter(
      (m) =>
        m.cooperadoId === cooperadoId &&
        m.mesReferencia === mesReferencia &&
        (m.status === "pendente" || m.status === "atrasada")
    )
    .map((m) => ({
      tipo: "mensalidade" as const,
      motivo: `Mensalidade ${mesReferencia}`,
      valor: m.valor,
    }));
}

function findArquivoMensalIndex(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): number {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  return data.arquivosMensais.findIndex(
    (a) =>
      a.mesReferencia === mesReferencia &&
      (!cooperativaId || a.cooperativaId === cooperativaId) &&
      (a.cooperadoId === canonico ||
        a.cooperadoId === cooperadoId ||
        resolverCooperadoIdCanonico(data, a.cooperadoId, cooperativaId ?? a.cooperativaId) === canonico)
  );
}

export interface AjustesResumoPagamento {
  mensalidadeFixa?: number;
  descontoAvulso?: number;
  descontoAvulsoMotivo?: string;
}

export function ajustesFichaMesId(cooperativaId: string, mesReferencia: string): string {
  return `afm_${cooperativaId}_${mesReferencia}`;
}

export function upsertAjustesFichaMesCooperativa(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string,
  patch: AjustesResumoPagamento
): AjustesFichaMesCooperativa[] {
  const id = ajustesFichaMesId(cooperativaId, mesReferencia);
  const now = new Date().toISOString();
  const list = data.ajustesFichaMes ?? [];
  const idx = list.findIndex((a) => a.id === id);
  const cur = idx >= 0 ? list[idx] : undefined;
  const merged: AjustesFichaMesCooperativa = {
    id,
    cooperativaId,
    mesReferencia,
    mensalidadeFixa: patch.mensalidadeFixa !== undefined ? patch.mensalidadeFixa : cur?.mensalidadeFixa ?? 0,
    descontoAvulso: patch.descontoAvulso !== undefined ? patch.descontoAvulso : cur?.descontoAvulso ?? 0,
    descontoAvulsoMotivo:
      patch.descontoAvulsoMotivo !== undefined ? patch.descontoAvulsoMotivo : cur?.descontoAvulsoMotivo,
    updatedAt: now,
  };
  if (idx < 0) return [...list, merged];
  const next = [...list];
  next[idx] = merged;
  return next;
}

/** Ajustes de mensalidade/desconto avulso definidos pelo responsável para o mês (valem para todos). */
export function getAjustesCompartilhadosFichaMes(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string
): AjustesResumoPagamento | undefined {
  const id = ajustesFichaMesId(cooperativaId, mesReferencia);
  const direct = (data.ajustesFichaMes ?? []).find((a) => a.id === id);
  if (direct) {
    return {
      mensalidadeFixa: direct.mensalidadeFixa,
      descontoAvulso: direct.descontoAvulso,
      descontoAvulsoMotivo: direct.descontoAvulsoMotivo,
    };
  }

  const candidatos = data.arquivosMensais
    .filter(
      (a) =>
        a.cooperativaId === cooperativaId &&
        a.mesReferencia === mesReferencia &&
        (a.mensalidadeFixa != null || a.descontoAvulso != null || !!a.descontoAvulsoMotivo?.trim())
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const ref = candidatos[0];
  if (!ref) return undefined;

  return {
    mensalidadeFixa: ref.mensalidadeFixa,
    descontoAvulso: ref.descontoAvulso,
    descontoAvulsoMotivo: ref.descontoAvulsoMotivo,
  };
}

function collectCooperadoIdsFichaMes(data: AppData, cooperativaId: string, mesReferencia: string): Set<string> {
  const ids = new Set(listCooperadosDaCooperativa(data, cooperativaId).map((c) => c.id));
  for (const f of data.fichaCorrida) {
    if (f.cooperativaId === cooperativaId && f.mesReferencia === mesReferencia) {
      ids.add(f.cooperadoId);
    }
  }
  for (const a of data.arquivosMensais) {
    if (a.cooperativaId === cooperativaId && a.mesReferencia === mesReferencia) {
      ids.add(a.cooperadoId);
    }
  }
  return ids;
}

/** Propaga mensalidade e desconto avulso do mês para todos os cooperados da cooperativa. */
export function aplicarAjustesFichaMesTodosCooperados(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string,
  patch: AjustesResumoPagamento
): ArquivoMensalCooperado[] {
  let arquivos = data.arquivosMensais;
  const ctxBase = { ...data };

  for (const cooperadoId of collectCooperadoIdsFichaMes(data, cooperativaId, mesReferencia)) {
    arquivos = upsertArquivoMensal(
      { ...ctxBase, arquivosMensais: arquivos },
      cooperadoId,
      cooperativaId,
      mesReferencia,
      {
        mensalidadeFixa: patch.mensalidadeFixa,
        descontoAvulso: patch.descontoAvulso,
        descontoAvulsoMotivo: patch.descontoAvulsoMotivo,
      }
    );
  }

  return arquivos;
}

export function upsertArquivoMensal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  mesReferencia: string,
  patch: Partial<
      Pick<
      ArquivoMensalCooperado,
      | "notaPedidoIds"
      | "pagamentoIds"
      | "mensalidadeFixa"
      | "descontoAvulso"
      | "descontoAvulsoMotivo"
      | "cotaIngressoPaga"
      | "contaCoopDescontos"
    >
  >
): ArquivoMensalCooperado[] {
  const now = new Date().toISOString();
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const idx = findArquivoMensalIndex(data, cooperadoId, mesReferencia, cooperativaId);
  if (idx < 0) {
    const novo: ArquivoMensalCooperado = {
      id: `am_${Date.now()}`,
      cooperativaId,
      cooperadoId: canonico,
      mesReferencia,
      notaPedidoIds: patch.notaPedidoIds ?? [],
      pagamentoIds: patch.pagamentoIds ?? [],
      mensalidadeFixa: patch.mensalidadeFixa,
      descontoAvulso: patch.descontoAvulso,
      descontoAvulsoMotivo: patch.descontoAvulsoMotivo,
      cotaIngressoPaga: patch.cotaIngressoPaga,
      contaCoopDescontos: patch.contaCoopDescontos,
      updatedAt: now,
    };
    return [...data.arquivosMensais, novo];
  }
  const cur = data.arquivosMensais[idx];
  const merged: ArquivoMensalCooperado = {
    ...cur,
    cooperadoId: canonico,
    notaPedidoIds: patch.notaPedidoIds
      ? [...new Set([...cur.notaPedidoIds, ...patch.notaPedidoIds])]
      : cur.notaPedidoIds,
    pagamentoIds: patch.pagamentoIds
      ? [...new Set([...cur.pagamentoIds, ...patch.pagamentoIds])]
      : cur.pagamentoIds,
    mensalidadeFixa: patch.mensalidadeFixa !== undefined ? patch.mensalidadeFixa : cur.mensalidadeFixa,
    descontoAvulso: patch.descontoAvulso !== undefined ? patch.descontoAvulso : cur.descontoAvulso,
    descontoAvulsoMotivo: patch.descontoAvulsoMotivo !== undefined ? patch.descontoAvulsoMotivo : cur.descontoAvulsoMotivo,
    cotaIngressoPaga: patch.cotaIngressoPaga !== undefined ? patch.cotaIngressoPaga : cur.cotaIngressoPaga,
    contaCoopDescontos: patch.contaCoopDescontos !== undefined ? patch.contaCoopDescontos : cur.contaCoopDescontos,
    updatedAt: now,
  };
  const next = [...data.arquivosMensais];
  next[idx] = merged;
  return next;
}

function arquivoMensalSyncKey(data: AppData, a: ArquivoMensalCooperado): string {
  const canonico = resolverCooperadoIdCanonico(data, a.cooperadoId, a.cooperativaId);
  return `${a.cooperativaId}|${canonico}|${a.mesReferencia}`;
}

function arquivoMensalTime(a: ArquivoMensalCooperado): number {
  return a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
}

/** Mantém cota paga; só desmarca se o lado mais recente tiver false explícito
 *  E o outro lado não for true com mesmo/maior updatedAt (responsável não “volta sozinho”). */
function mergeCotaIngressoPagaField(
  a: ArquivoMensalCooperado,
  b: ArquivoMensalCooperado
): boolean | undefined {
  const aTrue = a.cotaIngressoPaga === true;
  const bTrue = b.cotaIngressoPaga === true;
  const aFalse = a.cotaIngressoPaga === false;
  const bFalse = b.cotaIngressoPaga === false;

  if (aTrue && bTrue) return true;
  if (aTrue && !bFalse) return true;
  if (bTrue && !aFalse) return true;

  // Um true e um false: só aceita false se o registro com false for estritamente mais novo.
  if (aTrue && bFalse) {
    return arquivoMensalTime(b) > arquivoMensalTime(a) ? false : true;
  }
  if (bTrue && aFalse) {
    return arquivoMensalTime(a) > arquivoMensalTime(b) ? false : true;
  }

  if (aFalse || bFalse) return false;
  return undefined;
}

function mergeParArquivoMensal(
  data: AppData,
  a: ArquivoMensalCooperado,
  b: ArquivoMensalCooperado
): ArquivoMensalCooperado {
  const newer = arquivoMensalTime(a) >= arquivoMensalTime(b) ? a : b;
  const older = newer === a ? b : a;
  const updatedAt =
    arquivoMensalTime(a) >= arquivoMensalTime(b) ? a.updatedAt : b.updatedAt;
  return {
    ...newer,
    cooperadoId: resolverCooperadoIdCanonico(data, newer.cooperadoId, newer.cooperativaId),
    notaPedidoIds: [...new Set([...a.notaPedidoIds, ...b.notaPedidoIds])],
    pagamentoIds: [...new Set([...a.pagamentoIds, ...b.pagamentoIds])],
    mensalidadeFixa: newer.mensalidadeFixa ?? older.mensalidadeFixa,
    descontoAvulso: newer.descontoAvulso ?? older.descontoAvulso,
    descontoAvulsoMotivo: newer.descontoAvulsoMotivo ?? older.descontoAvulsoMotivo,
    cotaIngressoPaga: mergeCotaIngressoPagaField(a, b),
    updatedAt,
  };
}

/** Mescla arquivos mensais por cooperado+mês, preservando cota paga na sincronização. */
export function mergeArquivosMensaisFromCloud(
  data: AppData,
  localCoop: ArquivoMensalCooperado[],
  cloudItems: ArquivoMensalCooperado[]
): ArquivoMensalCooperado[] {
  const map = new Map<string, ArquivoMensalCooperado>();

  for (const item of cloudItems) {
    const key = arquivoMensalSyncKey(data, item);
    const cur = map.get(key);
    const normalized = {
      ...item,
      cooperadoId: resolverCooperadoIdCanonico(data, item.cooperadoId, item.cooperativaId),
    };
    map.set(key, cur ? mergeParArquivoMensal(data, cur, normalized) : normalized);
  }

  for (const item of localCoop) {
    const key = arquivoMensalSyncKey(data, item);
    const cur = map.get(key);
    map.set(key, cur ? mergeParArquivoMensal(data, cur, item) : item);
  }

  return [...map.values()];
}

export function getArquivoMensalCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ArquivoMensalCooperado | undefined {
  const idx = findArquivoMensalIndex(data, cooperadoId, mesReferencia, cooperativaId);
  return idx >= 0 ? data.arquivosMensais[idx] : undefined;
}

export function getMensalidadeFixaMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): number {
  const coopId =
    cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const compartilhado = coopId ? getAjustesCompartilhadosFichaMes(data, coopId, mesReferencia) : undefined;
  if (compartilhado?.mensalidadeFixa != null && compartilhado.mensalidadeFixa > 0) {
    return compartilhado.mensalidadeFixa;
  }
  const arquivo = getArquivoMensalCooperado(data, cooperadoId, mesReferencia, coopId);
  if (arquivo?.mensalidadeFixa != null && arquivo.mensalidadeFixa > 0) {
    return arquivo.mensalidadeFixa;
  }
  const pendente = data.mensalidades.find(
    (m) =>
      m.cooperadoId === cooperadoId &&
      m.mesReferencia === mesReferencia &&
      (m.status === "pendente" || m.status === "atrasada")
  );
  if (pendente) return pendente.valor;
  const coop = coopId ? data.cooperativas.find((c) => c.id === coopId) : undefined;
  return coop?.mensalidadeConfig?.valorPadrao ?? 0;
}

export type StatusCotaCooperado = "paga" | "nao_paga" | "sem_cota";

export function getStatusCotaCooperado(data: AppData, cooperadoId: string, mesReferencia: string): StatusCotaCooperado {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const arquivo = getArquivoMensalCooperado(data, cooperadoId, mesReferencia, coopId);
  if (arquivo?.cotaIngressoPaga) return "paga";

  const cotas = data.cotas.filter((c) => c.cooperadoId === cooperadoId);
  if (cotas.length === 0) return "nao_paga";
  if (cotas.every((c) => c.status === "quitada")) return "paga";
  return "nao_paga";
}

export function setCotaIngressoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  mesReferencia: string,
  paga: boolean
): AppData {
  return {
    ...data,
    arquivosMensais: upsertArquivoMensal(data, cooperadoId, cooperativaId, mesReferencia, {
      cotaIngressoPaga: paga,
    }),
  };
}

export function buildFichaFromNota(
  nota: NotaPedido,
  data: AppData,
  responsavel: string,
  cooperadoNome?: string,
  opts?: { fotoIndex?: number; totalFotos?: number }
): FichaCorrida {
  const saldoAnterior =
    opts?.fotoIndex != null
      ? getSaldoAnteriorFicha(data, nota.cooperadoId, nota.mesReferencia)
      : getSaldoAnteriorFicha(data, nota.cooperadoId, nota.mesReferencia, nota.id);
  const inst = data.instituicoes.find((i) => i.id === nota.instituicaoId);
  const escola = nota.escolaAvulsaNome?.trim() || inst?.nome || "Instituição";
  const sufixoFoto =
    opts?.fotoIndex != null && opts.totalFotos != null && opts.totalFotos > 1
      ? ` (foto ${opts.fotoIndex + 1}/${opts.totalFotos})`
      : "";
  const descontosDetalhe: FichaCorridaDesconto[] = [];
  if (nota.valorDesconto > 0) {
    descontosDetalhe.push({
      tipo: "cooperativa",
      motivo: `Taxa cooperativa (${nota.percentualDescontoCooperativa}%)`,
      valor: nota.valorDesconto,
    });
  }
  return {
    id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    cooperativaId: nota.cooperativaId,
    cooperadoId: nota.cooperadoId,
    cooperadoNomeSnapshot:
      cooperadoNome?.trim() ||
      nota.cooperadoNomeSnapshot?.trim() ||
      data.cooperados.find((c) => c.id === nota.cooperadoId)?.nomeCompleto,
    notaPedidoId: nota.id,
    descricao: `Nota ${nota.numeroNota} — ${escola}${sufixoFoto}`,
    valorBruto: nota.valorBruto,
    descontos: nota.valorDesconto,
    valorLiquido: nota.valorLiquido,
    saldoAcumulado: round2(saldoAnterior + nota.valorLiquido),
    mesReferencia: nota.mesReferencia,
    status: "pendente",
    dataLancamento: new Date().toISOString().split("T")[0],
    dataPagamentoPrevista: getUltimoDiaMes(nota.mesReferencia),
    responsavelConferencia: responsavel,
    itens: nota.itens,
    percentualDescontoCooperativa: nota.percentualDescontoCooperativa,
    descontosDetalhe,
    createdAt: new Date().toISOString(),
  };
}

function getUltimoDiaMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-");
  const lastDay = new Date(parseInt(ano), parseInt(mes), 0).getDate();
  return `${mesReferencia}-${String(lastDay).padStart(2, "0")}`;
}

function dividirValorEntrega(total: number, index: number, count: number): number {
  if (count <= 1) return round2(total);
  if (index === count - 1) {
    const parte = round2(total / count);
    return round2(total - parte * (count - 1));
  }
  return round2(total / count);
}

function dividirItensEntrega(itens: NotaPedidoItem[], index: number, count: number): NotaPedidoItem[] {
  return itens
    .map((item) => ({
      ...item,
      quantidade: dividirValorEntrega(item.quantidade, index, count),
      valorBruto: dividirValorEntrega(item.valorBruto, index, count),
    }))
    .filter((i) => i.quantidade > 0);
}

/** Monta divisão a partir da lista explícita de cooperados (mín. 2). */
export function criarDivisaoEntregaFromParticipantes(
  data: AppData,
  cooperativaId: string,
  origemId: string,
  origemNome: string,
  participanteIds: string[]
): DivisaoEntregaNota | undefined {
  const ids = participanteIds
    .map((id) => resolverCooperadoIdCanonico(data, id, cooperativaId))
    .filter(Boolean);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length < 2) return undefined;

  return {
    cooperadoOrigemId: origemId,
    cooperadoOrigemNome: origemNome,
    participantes: uniqueIds.map((id) => ({
      cooperadoId: id,
      cooperadoNome: getCooperadoNomeResolvido(data, id, cooperativaId),
    })),
    divididoEm: new Date().toISOString(),
  };
}

/** Cria N fichas divididas igualmente (opcional: fatia por foto). */
export function buildFichasDivisaoFromNota(
  data: AppData,
  nota: NotaPedido,
  responsavel: string,
  divisao: DivisaoEntregaNota,
  baseFichaCorrida: FichaCorrida[],
  opts?: { fotoIndex?: number; totalFotos?: number }
): FichaCorrida[] {
  const participantes = divisao.participantes;
  const N = participantes.length;
  const novasFichas: FichaCorrida[] = [];

  for (let i = 0; i < N; i++) {
    const p = participantes[i];
    const ctx = { ...data, fichaCorrida: [...baseFichaCorrida, ...novasFichas] };
    const notaParticipante: NotaPedido = {
      ...nota,
      cooperadoId: p.cooperadoId,
      cooperadoNomeSnapshot: p.cooperadoNome,
    };
    const base = buildFichaFromNota(notaParticipante, ctx, responsavel, p.cooperadoNome, opts);
    const itensFatia = dividirItensEntrega(nota.itens ?? [], i, N);
    const calc = calcularItensNota(itensFatia, nota.percentualDescontoCooperativa);
    const valorBruto = calc.valorBruto;
    const descontos = calc.valorDesconto;
    const valorLiquido = calc.valorLiquido;
    const saldoAnterior =
      opts?.fotoIndex != null
        ? getSaldoAnteriorFicha(ctx, p.cooperadoId, nota.mesReferencia)
        : getSaldoAnteriorFicha(ctx, p.cooperadoId, nota.mesReferencia, nota.id);
    const ficha: FichaCorrida = {
      ...base,
      valorBruto,
      descontos,
      valorLiquido,
      itens: calc.itens,
      descontosDetalhe:
        descontos > 0
          ? [
              {
                tipo: "cooperativa" as const,
                motivo: `Taxa cooperativa (${nota.percentualDescontoCooperativa}%)`,
                valor: descontos,
              },
            ]
          : [],
      saldoAcumulado: round2(saldoAnterior + valorLiquido),
      divisaoEntrega: divisao,
    };
    if (nota.status === "pago") ficha.status = "pago";
    novasFichas.push(ficha);
  }

  return novasFichas;
}

/** Divide a nota conferida em N lançamentos (foto 1/N … N/N) com totais que somam a nota. */
function buildFichasMultiFotoFromNota(
  data: AppData,
  nota: NotaPedido,
  responsavel: string,
  baseFichaCorrida: FichaCorrida[],
  totalFotos: number
): FichaCorrida[] {
  const novasFichas: FichaCorrida[] = [];
  for (let i = 0; i < totalFotos; i++) {
    const ctx = { ...data, fichaCorrida: [...baseFichaCorrida, ...novasFichas] };
    const base = buildFichaFromNota(nota, ctx, responsavel, nota.cooperadoNomeSnapshot, {
      fotoIndex: i,
      totalFotos,
    });
    const itensFatia = dividirItensEntrega(nota.itens ?? [], i, totalFotos);
    const calc = calcularItensNota(itensFatia, nota.percentualDescontoCooperativa);
    const valorBruto = calc.valorBruto;
    const descontos = calc.valorDesconto;
    const valorLiquido = calc.valorLiquido;
    const saldoAnterior = getSaldoAnteriorFicha(ctx, nota.cooperadoId, nota.mesReferencia, nota.id);
    const ficha: FichaCorrida = {
      ...base,
      valorBruto,
      descontos,
      valorLiquido,
      itens: calc.itens,
      descontosDetalhe:
        descontos > 0
          ? [
              {
                tipo: "cooperativa" as const,
                motivo: `Taxa cooperativa (${nota.percentualDescontoCooperativa}%)`,
                valor: descontos,
              },
            ]
          : [],
      saldoAcumulado: round2(saldoAnterior + valorLiquido),
    };
    if (nota.status === "pago") ficha.status = "pago";
    novasFichas.push(ficha);
  }
  return novasFichas;
}

function recalcularSaldosFichaNota(
  fichaCorrida: FichaCorrida[],
  nota: NotaPedido
): FichaCorrida[] {
  let next = recalcularSaldosFichaCooperadoMes(fichaCorrida, nota.cooperadoId, nota.mesReferencia);
  for (const p of nota.divisaoEntrega?.participantes ?? []) {
    if (p.cooperadoId !== nota.cooperadoId) {
      next = recalcularSaldosFichaCooperadoMes(next, p.cooperadoId, nota.mesReferencia);
    }
  }
  return next;
}

/** Recria fichas da nota (1 ou N cooperados conforme divisaoEntrega). */
export function rebuildFichasNota(data: AppData, nota: NotaPedido): AppData {
  const without = data.fichaCorrida.filter((f) => f.notaPedidoId !== nota.id);
  const responsavel = nota.conferidaPor ?? "Cooperativa";
  const participantes = nota.divisaoEntrega?.participantes ?? [];

  if (participantes.length > 1) {
    const divisao = nota.divisaoEntrega!;
    const novasFichas = buildFichasDivisaoFromNota(data, nota, responsavel, divisao, without);
    let fichaCorrida = recalcularSaldosFichaNota([...without, ...novasFichas], nota);

    let arquivosMensais = data.arquivosMensais;
    for (const p of participantes) {
      arquivosMensais = upsertArquivoMensal(
        { ...data, fichaCorrida, arquivosMensais },
        p.cooperadoId,
        nota.cooperativaId,
        nota.mesReferencia,
        { notaPedidoIds: [nota.id] }
      );
    }

    return { ...data, fichaCorrida, arquivosMensais };
  }

  const qtdPartes = inferirQtdPartesFichaNota(data.fichaCorrida, nota);
  let novasFichas: FichaCorrida[];
  if (qtdPartes > 1) {
    novasFichas = buildFichasMultiFotoFromNota(data, nota, responsavel, without, qtdPartes);
  } else {
    const ctx = { ...data, fichaCorrida: without };
    const ficha = buildFichaFromNota(nota, ctx, responsavel, nota.cooperadoNomeSnapshot);
    if (nota.status === "pago") ficha.status = "pago";
    novasFichas = [ficha];
  }

  const fichaCorrida = recalcularSaldosFichaNota([...without, ...novasFichas], nota);
  const arquivosMensais = upsertArquivoMensal(
    { ...data, fichaCorrida: without },
    nota.cooperadoId,
    nota.cooperativaId,
    nota.mesReferencia,
    { notaPedidoIds: [nota.id] }
  );
  return { ...data, fichaCorrida, arquivosMensais };
}

export function dividirEntregaEntreCooperados(
  data: AppData,
  notaPedidoId: string,
  outrosCooperadoIds: string[],
  cooperativaId: string
): AppData {
  const nota = data.notasPedido.find((n) => n.id === notaPedidoId);
  if (!nota || nota.cooperativaId !== cooperativaId) return data;
  if (nota.status !== "conferida") return data;

  const fichasNota = data.fichaCorrida.filter((f) => f.notaPedidoId === notaPedidoId);
  if (fichasNota.some((f) => f.status === "pago")) return data;

  const origemId = nota.cooperadoId;
  const origemNome =
    nota.cooperadoNomeSnapshot?.trim() ||
    getCooperadoNomeResolvido(data, origemId, cooperativaId);

  const ids = [
    origemId,
    ...outrosCooperadoIds.filter((id) => id !== origemId && data.cooperados.some((c) => c.id === id)),
  ];
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length < 2) {
    const notaSemDivisao: NotaPedido = {
      ...nota,
      divisaoEntrega: undefined,
      updatedAt: new Date().toISOString(),
    };
    const notasPedido = data.notasPedido.map((n) => (n.id === notaPedidoId ? notaSemDivisao : n));
    return rebuildFichasNota({ ...data, notasPedido }, notaSemDivisao);
  }

  const participantes = uniqueIds.map((id) => ({
    cooperadoId: id,
    cooperadoNome: getCooperadoNomeResolvido(data, id, cooperativaId),
  }));

  const divisaoEntrega: DivisaoEntregaNota = {
    cooperadoOrigemId: origemId,
    cooperadoOrigemNome: origemNome,
    participantes,
    divididoEm: new Date().toISOString(),
  };

  const notaAtualizada: NotaPedido = {
    ...nota,
    divisaoEntrega,
    updatedAt: new Date().toISOString(),
  };

  const notasPedido = data.notasPedido.map((n) => (n.id === notaPedidoId ? notaAtualizada : n));
  return rebuildFichasNota({ ...data, notasPedido }, notaAtualizada);
}

/** Parte da ficha: lançamento único da nota ou fatia por foto (multi-foto). */
export function chaveParteFichaCorrida(f: FichaCorrida): string {
  const m = f.descricao.match(/\(foto\s+(\d+)\s*\/\s*(\d+)\)/i);
  const divisao = (f.divisaoEntrega?.participantes.length ?? 0) > 1;
  const coop = f.cooperadoId;
  if (divisao) {
    if (m) return `div:${coop}:foto:${m[1]}/${m[2]}`;
    return `div:${coop}:full`;
  }
  if (m) return `foto:${m[1]}/${m[2]}`;
  return "full";
}

export function somaValorBrutoFichasNota(fichas: FichaCorrida[], notaId: string): number {
  return round2(
    fichas.filter((f) => f.notaPedidoId === notaId).reduce((s, f) => s + (f.valorBruto ?? 0), 0)
  );
}

export function somaTotaisFichasNota(
  fichas: FichaCorrida[],
  notaId: string
): { valorBruto: number; valorDesconto: number; valorLiquido: number } {
  const list = fichas.filter((f) => f.notaPedidoId === notaId);
  return {
    valorBruto: round2(list.reduce((s, f) => s + (f.valorBruto ?? 0), 0)),
    valorDesconto: round2(list.reduce((s, f) => s + (f.descontos ?? 0), 0)),
    valorLiquido: round2(list.reduce((s, f) => s + (f.valorLiquido ?? 0), 0)),
  };
}

/** Soma das fichas da nota bate com bruto e líquido conferidos. */
export function fichasValoresAlinhadosComNota(fichas: FichaCorrida[], nota: NotaPedido): boolean {
  const { valorBruto, valorLiquido } = somaTotaisFichasNota(fichas, nota.id);
  return (
    Math.abs(valorBruto - nota.valorBruto) <= 0.01 &&
    Math.abs(valorLiquido - nota.valorLiquido) <= 0.01
  );
}

/** Agrega itens de todas as fichas da nota (divisão entre cooperados / multi-foto). */
export function consolidarItensDeFichasNota(
  fichas: FichaCorrida[],
  notaId: string
): NotaPedidoItem[] {
  const map = new Map<string, NotaPedidoItem>();
  for (const f of fichas.filter((x) => x.notaPedidoId === notaId)) {
    for (const item of f.itens ?? []) {
      if ((item.quantidade ?? 0) <= 0) continue;
      const key = item.produtoInstituicaoId || `${item.produtoNome.trim()}::${item.unidade.trim()}`;
      const valorLinha = valorBrutoItemLinha(item);
      const existente = map.get(key);
      if (existente) {
        existente.quantidade = round2(existente.quantidade + item.quantidade);
        existente.valorBruto = round2(existente.valorBruto + valorLinha);
      } else {
        map.set(key, { ...item, valorBruto: valorLinha });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
}

/** Ajusta totais da nota para bater com a soma das fichas (multi-entrega). */
export function sincronizarTotaisNotaComFichas(
  nota: NotaPedido,
  fichas: FichaCorrida[],
  opts?: { forcarDescontoLiquido?: boolean; sincronizarBruto?: boolean; sincronizarItens?: boolean }
): NotaPedido {
  const list = fichas.filter((f) => f.notaPedidoId === nota.id);
  if (!list.length) return nota;
  const tot = somaTotaisFichasNota(fichas, nota.id);
  const brutoCompativel =
    opts?.sincronizarBruto ||
    opts?.forcarDescontoLiquido ||
    Math.abs(tot.valorBruto - nota.valorBruto) <= 0.05;
  if (!brutoCompativel) return nota;

  const itensFicha = consolidarItensDeFichasNota(fichas, nota.id);
  const calcItens =
    itensFicha.length > 0
      ? calcularItensNota(itensFicha, nota.percentualDescontoCooperativa ?? 0)
      : null;
  const itensDesalinhados =
    calcItens != null &&
    (Math.abs(calcItens.valorBruto - nota.valorBruto) > 0.05 ||
      Math.abs(calcItens.valorLiquido - nota.valorLiquido) > 0.05);

  const totaisOk = fichasValoresAlinhadosComNota(fichas, nota);
  if (totaisOk && !itensDesalinhados && !opts?.sincronizarItens) return nota;

  const sincronizarItens =
    opts?.sincronizarItens ?? (itensDesalinhados || (nota.divisaoEntrega?.participantes.length ?? 0) > 1);

  let updated: NotaPedido = {
    ...nota,
    ...(opts?.sincronizarBruto || opts?.forcarDescontoLiquido || !totaisOk
      ? { valorBruto: tot.valorBruto }
      : {}),
    ...(!totaisOk
      ? {
          valorDesconto: tot.valorDesconto,
          valorLiquido: tot.valorLiquido,
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  if (sincronizarItens && calcItens) {
    updated = {
      ...updated,
      itens: calcItens.itens,
      ...(opts?.sincronizarBruto || opts?.forcarDescontoLiquido || !totaisOk
        ? {}
        : {
            valorBruto: tot.valorBruto,
            valorDesconto: tot.valorDesconto,
            valorLiquido: tot.valorLiquido,
          }),
    };
  }

  return updated;
}

/** Alinha uma ficha única da nota com os totais conferidos (centavos de arredondamento). */
export function alinharFichaUnicaComNota(
  fichas: FichaCorrida[],
  nota: NotaPedido
): FichaCorrida[] {
  const list = fichas.filter((f) => f.notaPedidoId === nota.id);
  if (list.length !== 1) return fichas;
  const f = list[0];
  if (
    Math.abs((f.valorBruto ?? 0) - nota.valorBruto) <= 0.02 &&
    Math.abs((f.descontos ?? 0) - nota.valorDesconto) <= 0.01 &&
    Math.abs((f.valorLiquido ?? 0) - nota.valorLiquido) <= 0.01
  ) {
    return fichas;
  }
  if (Math.abs((f.valorBruto ?? 0) - nota.valorBruto) > 0.02) return fichas;
  const descontosDetalhe =
    nota.valorDesconto > 0
      ? [
          {
            tipo: "cooperativa" as const,
            motivo: `Taxa cooperativa (${nota.percentualDescontoCooperativa}%)`,
            valor: nota.valorDesconto,
          },
        ]
      : [];
  return fichas.map((entry) =>
    entry.id === f.id
      ? {
          ...entry,
          descontos: nota.valorDesconto,
          valorLiquido: nota.valorLiquido,
          descontosDetalhe,
        }
      : entry
  );
}

function inferirQtdPartesFichaNota(fichas: FichaCorrida[], nota: NotaPedido): number {
  const fromNota = contarFotosEnviadasNota(nota);
  if (fromNota > 1) return fromNota;
  const existing = fichas.filter((f) => f.notaPedidoId === nota.id);
  let maxTotal = 0;
  for (const f of existing) {
    const m = f.descricao.match(/\(foto (\d+)\/(\d+)\)/);
    if (m) maxTotal = Math.max(maxTotal, parseInt(m[2], 10));
  }
  return maxTotal > 1 ? maxTotal : 1;
}

/** Verifica se cada participante da divisão tem ao menos uma ficha na nota. */
export function divisaoFichasCobremParticipantes(
  data: AppData,
  fichas: FichaCorrida[],
  nota: NotaPedido
): boolean {
  const participantes = nota.divisaoEntrega?.participantes ?? [];
  if (participantes.length <= 1) return fichas.length >= 1;
  return participantes.every((p) =>
    fichas.some((f) => fichaPertenceCooperado(data, f, p.cooperadoId, nota.cooperativaId))
  );
}

/**
 * Remove fichas duplicadas da mesma nota (ex.: sync criou uma e o lançamento outra).
 * Mantém fatias por foto quando houver; se existir só "full", fica uma por notaPedidoId.
 */
export function dedupeFichaCorridaPorNota(
  fichas: FichaCorrida[],
  notas?: NotaPedido[]
): FichaCorrida[] {
  const notaValor = new Map((notas ?? []).map((n) => [n.id, n.valorLiquido]));
  const byNota = new Map<string, FichaCorrida[]>();

  for (const f of fichas) {
    const list = byNota.get(f.notaPedidoId) ?? [];
    list.push(f);
    byNota.set(f.notaPedidoId, list);
  }

  const out: FichaCorrida[] = [];
  for (const [notaId, list] of byNota) {
    const parts = list.map((f) => ({ f, part: chaveParteFichaCorrida(f) }));
    const hasFotoParts = parts.some((p) => p.part.startsWith("foto:"));
    const best = new Map<string, FichaCorrida>();

    for (const { f, part } of parts) {
      if (hasFotoParts && part === "full") continue;
      const cur = best.get(part);
      if (!cur) {
        best.set(part, f);
        continue;
      }
      const target = notaValor.get(notaId);
      const curMatch = target != null && Math.abs(cur.valorLiquido - target) < 0.01;
      const newMatch = target != null && Math.abs(f.valorLiquido - target) < 0.01;
      if (newMatch && !curMatch) {
        best.set(part, f);
        continue;
      }
      if (curMatch && !newMatch) continue;
      const tNew = new Date(f.createdAt).getTime();
      const tCur = new Date(cur.createdAt).getTime();
      if (tNew >= tCur) best.set(part, f);
    }

    out.push(...best.values());
  }

  return out;
}

/** Só entra no “a pagar” ficha pendente cuja nota existe e está conferida (não rejeitada/rascunho). */
export function fichaNotaElegivelParaPagamento(data: AppData, ficha: FichaCorrida): boolean {
  if (ficha.status !== "pendente") return false;
  const nota = data.notasPedido.find((n) => n.id === ficha.notaPedidoId);
  if (!nota) return false;
  return nota.status === "conferida";
}

/** Ficha válida no extrato (cooperado e responsável) — amarrada a nota conferida/paga. */
export function fichaValidaNoExtrato(data: AppData, ficha: FichaCorrida): boolean {
  const nota = data.notasPedido.find((n) => n.id === ficha.notaPedidoId);
  if (!nota) return fichaPreservarSemNotaLocal(data, ficha);
  if (nota.status === "rejeitada" || nota.status === "rascunho") return false;
  if (nota.status !== "conferida" && nota.status !== "pago") {
    return fichaPreservarSemNotaLocal(data, ficha);
  }
  if (ficha.status === "pago") return true;
  if (ficha.status === "pendente") return fichaNotaElegivelParaPagamento(data, ficha);
  return false;
}

/** Fichas do mês para extrato e totais por item (mesma base do “a receber”). */
export function listarFichasExtratoCooperadoMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): FichaCorrida[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const candidatas = data.fichaCorrida.filter(
    (f) =>
      fichaPertenceCooperado(data, f, cooperadoId, coopId) &&
      f.mesReferencia === mesReferencia &&
      fichaValidaNoExtrato(data, f)
  );
  return dedupeFichaCorridaPorNota(candidatas, data.notasPedido);
}

/** Remove lançamentos órfãos ou de notas ainda não conferidas (evita valor inflado no app). */
export function purgarFichasInvalidas(data: AppData): AppData {
  if (isCloudSyncInProgress()) return data;

  const removidas = data.fichaCorrida.filter((f) => !fichaValidaNoExtrato(data, f));
  if (removidas.length === 0) return data;

  // Salvaguarda: nunca zerar ficha de cooperado que ainda tem notas conferidas locais.
  const cooperadosAfetados = new Set(
    removidas.map((f) => `${f.cooperativaId ?? ""}|${f.cooperadoId}`)
  );
  for (const chave of cooperadosAfetados) {
    const [cooperativaId, cooperadoId] = chave.split("|");
    if (!cooperadoId) continue;
    const conferidas = data.notasPedido.filter(
      (n) =>
        n.cooperadoId === cooperadoId &&
        (n.status === "conferida" || n.status === "pago") &&
        (!cooperativaId || n.cooperativaId === cooperativaId)
    ).length;
    if (conferidas === 0) continue;

    const pendentesAtuais = data.fichaCorrida.filter(
      (f) =>
        f.cooperadoId === cooperadoId &&
        f.status === "pendente" &&
        (!cooperativaId || f.cooperativaId === cooperativaId)
    );
    const pendentesApos = pendentesAtuais.filter((f) => fichaValidaNoExtrato(data, f));
    const removendoTodosPendentes =
      pendentesAtuais.length > 0 && pendentesApos.length === 0;
    if (removendoTodosPendentes && !notasSyncProvavelmenteCompleto(data, cooperativaId)) {
      return data;
    }
  }

  let fichaCorrida = data.fichaCorrida.filter((f) => fichaValidaNoExtrato(data, f));
  const pares = new Set(removidas.map((f) => `${f.cooperadoId}|${f.mesReferencia}`));
  for (const par of pares) {
    const [cooperadoId, mesReferencia] = par.split("|");
    fichaCorrida = recalcularSaldosFichaCooperadoMes(fichaCorrida, cooperadoId, mesReferencia);
  }

  const arquivosMensais = data.arquivosMensais.map((a) => ({
    ...a,
    notaPedidoIds: a.notaPedidoIds.filter((id) =>
      fichaCorrida.some((f) => f.notaPedidoId === id && f.cooperadoId === a.cooperadoId)
    ),
  }));

  return { ...data, fichaCorrida, arquivosMensais };
}

/** Fichas pendentes válidas para pagamento (deduplicadas e amarradas a nota conferida). */
export function listarFichasPendentesPagamento(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): FichaCorrida[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const candidatas = data.fichaCorrida.filter(
    (f) =>
      fichaPertenceCooperado(data, f, cooperadoId, coopId) &&
      f.mesReferencia === mesReferencia &&
      f.status === "pendente"
  );
  return dedupeFichaCorridaPorNota(candidatas, data.notasPedido).filter((f) =>
    fichaValidaNoExtrato(data, f)
  );
}

/** Cria lançamentos na ficha a partir de notas já conferidas (sincronizadas da nuvem). */
export function reconciliarFichaFromNotasConferidas(data: AppData): AppData {
  const dedupedInitial = dedupeFichaCorridaPorNota(data.fichaCorrida, data.notasPedido);
  let fichaCorrida = dedupedInitial;
  let changed = dedupedInitial.length !== data.fichaCorrida.length;
  const fichaNotaIds = new Set(fichaCorrida.map((f) => f.notaPedidoId));
  let arquivosMensais = data.arquivosMensais;

  const notasOrdenadas = [...data.notasPedido].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const nota of notasOrdenadas) {
    if (nota.status !== "conferida" && nota.status !== "pago") continue;
    if (nota.valorLiquido <= 0 && (nota.itens ?? []).every((i) => i.quantidade <= 0)) continue;

    const fichasExistentes = fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
    const qtdParticipantes = nota.divisaoEntrega?.participantes.length ?? 1;

    if (nota.divisaoEntrega && qtdParticipantes > 1) {
      if (
        divisaoFichasCobremParticipantes({ ...data, fichaCorrida }, fichasExistentes, nota) &&
        fichasValoresAlinhadosComNota(fichaCorrida, nota)
      ) {
        continue;
      }
      const ctx = { ...data, fichaCorrida, arquivosMensais };
      const rebuilt = rebuildFichasNota(ctx, nota);
      fichaCorrida = rebuilt.fichaCorrida;
      arquivosMensais = rebuilt.arquivosMensais;
      fichaNotaIds.add(nota.id);
      changed = true;
      continue;
    }

    if (fichasExistentes.length > 0) {
      if (fichasValoresAlinhadosComNota(fichaCorrida, nota)) continue;
      const ctx = { ...data, fichaCorrida, arquivosMensais };
      const rebuilt = rebuildFichasNota(ctx, nota);
      fichaCorrida = rebuilt.fichaCorrida;
      arquivosMensais = rebuilt.arquivosMensais;
      fichaNotaIds.add(nota.id);
      changed = true;
      continue;
    }

    if (fichaNotaIds.has(nota.id)) continue;

    const ctx = { ...data, fichaCorrida, arquivosMensais };
    const ficha = buildFichaFromNota(
      nota,
      ctx,
      nota.conferidaPor ?? "Cooperativa",
      nota.cooperadoNomeSnapshot
    );
    if (nota.status === "pago") {
      ficha.status = "pago";
    }
    fichaCorrida = [...fichaCorrida, ficha];
    fichaNotaIds.add(nota.id);
    arquivosMensais = upsertArquivoMensal(ctx, nota.cooperadoId, nota.cooperativaId, nota.mesReferencia, {
      notaPedidoIds: [nota.id],
    });
    changed = true;
  }

  const dedupedFinal = dedupeFichaCorridaPorNota(fichaCorrida, data.notasPedido);
  if (dedupedFinal.length !== fichaCorrida.length) {
    fichaCorrida = dedupedFinal;
    changed = true;
  }

  if (!changed) {
    return purgarFichasInvalidas(data);
  }
  return purgarFichasInvalidas({ ...data, fichaCorrida, arquivosMensais });
}

export function getTotalAPagarCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (mesReferencia) {
    return getResumoValorAPagarRelatorio(data, cooperadoId, mesReferencia, coopId).valorLiquido;
  }
  const meses = [
    ...new Set(
      data.fichaCorrida
        .filter(
          (f) =>
            fichaPertenceCooperado(data, f, cooperadoId, coopId) && f.status === "pendente"
        )
        .map((f) => f.mesReferencia)
    ),
  ];
  return round2(
    meses.reduce(
      (s, mes) => s + getResumoValorAPagarRelatorio(data, cooperadoId, mes, coopId).valorLiquido,
      0
    )
  );
}

/** Meses com ficha/pagamento pendente — sem chamar getResumoValorAPagar (evita recursão). */
function mesesReferenciaComDebitoAberto(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const meses = new Set<string>();

  for (const f of data.fichaCorrida) {
    if (
      fichaPertenceCooperado(data, f, canonico, coopId) &&
      f.status === "pendente" &&
      fichaValidaNoExtrato(data, f)
    ) {
      meses.add(f.mesReferencia);
    }
  }

  for (const p of data.pagamentosCooperado) {
    const pCanonico = resolverCooperadoIdCanonico(data, p.cooperadoId, p.cooperativaId ?? coopId);
    if (pCanonico !== canonico || p.status !== "aguardando_confirmacao") continue;
    for (const mes of getMesesReferenciaPagamento(p)) {
      meses.add(mes);
    }
  }

  return [...meses].sort();
}

export function getResumoPagamentoCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string,
  ajustes?: AjustesResumoPagamento
): {
  valorBruto: number;
  descontoCooperativa: number;
  descontosExtras: FichaCorridaDesconto[];
  valorEntregas: number;
  valorLiquido: number;
  fichaIds: string[];
  notaPedidoIds: string[];
} {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const fichas = listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId);
  const valorBruto = round2(fichas.reduce((s, f) => s + f.valorBruto, 0));
  const descontoCooperativa = round2(fichas.reduce((s, f) => s + f.descontos, 0));
  const valorEntregas = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
  const coopIdResolved = coopId ?? fichas[0]?.cooperativaId;
  const arquivo = getArquivoMensalCooperado(data, cooperadoCanonico, mesReferencia, coopIdResolved);
  const compartilhado =
    coopIdResolved != null
      ? getAjustesCompartilhadosFichaMes(data, coopIdResolved, mesReferencia)
      : undefined;
  const mensalidadeFixa =
    ajustes?.mensalidadeFixa !== undefined
      ? ajustes.mensalidadeFixa
      : getMensalidadeFixaMes(data, cooperadoCanonico, mesReferencia, coopIdResolved);
  const descontoAvulso =
    ajustes?.descontoAvulso !== undefined
      ? ajustes.descontoAvulso
      : arquivo?.descontoAvulso ?? compartilhado?.descontoAvulso ?? 0;
  const descontoAvulsoMotivo =
    ajustes?.descontoAvulsoMotivo !== undefined
      ? ajustes.descontoAvulsoMotivo
      : arquivo?.descontoAvulsoMotivo ?? compartilhado?.descontoAvulsoMotivo;
  const descontosExtras: FichaCorridaDesconto[] = [];
  const mesesPendentes = mesesReferenciaComDebitoAberto(data, cooperadoCanonico, coopIdResolved);
  const coopBruto = getDescontosContaCoopMesCached(data, cooperadoCanonico, mesReferencia, coopIdResolved);
  const coopMes = filtrarDescontosContaCoopParaMesReferencia(coopBruto, mesReferencia, mesesPendentes);
  const temContaCoopMes = coopMes.length > 0;
  if (mensalidadeFixa > 0) {
    descontosExtras.push({
      tipo: "mensalidade",
      motivo: `Mensalidade ${mesReferencia}`,
      valor: mensalidadeFixa,
    });
  }
  if (descontoAvulso > 0) {
    descontosExtras.push({
      tipo: "manual",
      motivo: descontoAvulsoMotivo?.trim() || "Desconto avulso",
      valor: descontoAvulso,
    });
  }
  for (const d of descontosDoCooperadoNoMes(data, cooperadoCanonico, mesReferencia)) {
    if (d.valorDescontado <= 0) continue;
    if (mensalidadeFixa > 0 && d.tipo === "mensalidade_aberta") continue;
    if (temContaCoopMes && descontoManualDuplicaContaCoop(d)) continue;
    descontosExtras.push({
      tipo: "manual",
      motivo: d.motivo,
      valor: d.valorDescontado,
    });
  }
  for (const avulso of valoresAvulsosPendentesMes(data, cooperadoCanonico, mesReferencia, coopIdResolved)) {
    if (avulso.valor <= 0) continue;
    descontosExtras.push({
      tipo: "credito_avulso",
      motivo: avulso.motivo.trim() || "Valor avulso a receber",
      valor: avulso.valor,
    });
  }
  const totalDescontos = round2(
    descontosExtras.filter((d) => d.tipo !== "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  const totalCreditos = round2(
    descontosExtras.filter((d) => d.tipo === "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  const valorLiquido = round2(Math.max(0, valorEntregas - totalDescontos + totalCreditos));
  return {
    valorBruto,
    descontoCooperativa,
    descontosExtras,
    valorEntregas,
    valorLiquido,
    fichaIds: fichas.map((f) => f.id),
    notaPedidoIds: fichas.map((f) => f.notaPedidoId),
  };
}

/** Valor líquido para relatórios e pagamento — inclui abatimento Conta Coop (mesma base da ficha). */
export function getResumoValorAPagarRelatorio(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoPagamentoCooperado {
  const base = getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, cooperativaId);
  return getResumoPagamentoParaRegistro(base, data, cooperadoId, mesReferencia, cooperativaId);
}

/** Valor exibido ao cooperado — entregas; menos uso Conta Coop no mercado quando houver compras no mês. */
export type ValorExibicaoCooperadoOpts = {
  data: AppData;
  cooperadoId: string;
  mesReferencia: string;
  cooperativaId?: string;
  cooperadoNome?: string;
};

export function buildValorExibicaoCooperadoOpts(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ValorExibicaoCooperadoOpts {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoNome = data.cooperados.find((c) => c.id === cooperadoId)?.nomeCompleto;
  return { data, cooperadoId, mesReferencia, cooperativaId: coopId, cooperadoNome };
}

export function getDescontosContaCoopMesCached(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): DescontoContaCoopRemoto[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const arquivo = getArquivoMensalCooperado(data, cooperadoId, mesReferencia, coopId);
  return descontosContaCoopFromArquivo(arquivo);
}

function aplicarDescontosContaCoopMesNoResumo(
  resumo: ResumoPagamentoCooperado,
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoPagamentoCooperado {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const mesesPendentes = mesesReferenciaComDebitoAberto(data, cooperadoId, coopId);
  const descontos = filtrarDescontosContaCoopParaMesReferencia(
    getDescontosContaCoopMesCached(data, cooperadoId, mesReferencia, coopId),
    mesReferencia,
    mesesPendentes
  );
  if (!descontos.length) return resumo;
  return mergeDescontosContaCoopNoResumo(resumo, descontos);
}

/** Resumo com abatimento Conta Coop quando houver compras no mercado no mês. */
export function getResumoExibicaoCooperadoPilot(
  resumo: ResumoPagamentoCooperado,
  opts?: ValorExibicaoCooperadoOpts
): ResumoPagamentoCooperado {
  if (!opts) return resumo;
  return aplicarDescontosContaCoopMesNoResumo(
    resumo,
    opts.data,
    opts.cooperadoId,
    opts.mesReferencia,
    opts.cooperativaId
  );
}

export function getValorExibicaoCooperado(
  resumo: ResumoPagamentoCooperado,
  opts?: ValorExibicaoCooperadoOpts
): number {
  if (!opts) return resumo.valorEntregas;
  const merged = getResumoExibicaoCooperadoPilot(resumo, opts);
  if (merged !== resumo) return merged.valorLiquido;
  return resumo.valorEntregas;
}

export function getDescontosExtrasExibicaoCooperado(
  resumo: ResumoPagamentoCooperado,
  opts?: ValorExibicaoCooperadoOpts
): FichaCorridaDesconto[] {
  if (!opts) return [];
  const merged = getResumoExibicaoCooperadoPilot(resumo, opts);
  if (merged === resumo) return [];
  return merged.descontosExtras;
}

/** Registro de pagamento pelo responsável — inclui abatimento Conta Coop (mercado). */
export function getResumoPagamentoParaRegistro(
  resumo: ResumoPagamentoCooperado,
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoPagamentoCooperado {
  return aplicarDescontosContaCoopMesNoResumo(resumo, data, cooperadoId, mesReferencia, cooperativaId);
}

export type ResumoPagamentoCooperado = ReturnType<typeof getResumoPagamentoCooperado>;

export function resumoFromPagamento(pagamento: PagamentoCooperadoRegistro): ResumoPagamentoCooperado {
  return {
    valorBruto: pagamento.valorBruto,
    descontoCooperativa: pagamento.descontoCooperativa,
    descontosExtras: pagamento.descontosExtras,
    valorEntregas: round2(pagamento.valorBruto - pagamento.descontoCooperativa),
    valorLiquido: pagamento.valorLiquido,
    fichaIds: pagamento.fichaIds,
    notaPedidoIds: pagamento.notaPedidoIds,
  };
}

/** Resumo para exibição — usa snapshot do pagamento quando a ficha já foi quitada pela cooperativa. */
export function getResumoPagamentoExibicao(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string,
  ajustes?: AjustesResumoPagamento
): ResumoPagamentoCooperado {
  const pagamento = getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia);
  if (pagamento) return resumoFromPagamento(pagamento);
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  return getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, coopId, ajustes);
}

export function getTotalRecebidoCooperado(data: AppData, cooperadoId: string, mesReferencia?: string): number {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const entries = data.fichaCorrida.filter((f) => {
    if (!fichaPertenceCooperado(data, f, cooperadoId, coopId) || f.status !== "pago") return false;
    if (mesReferencia && f.mesReferencia !== mesReferencia) return false;
    return true;
  });
  return round2(entries.reduce((s, f) => s + f.valorLiquido, 0));
}

export function persistDescontosContaCoopNoArquivo(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId: string,
  descontos: DescontoContaCoopRemoto[]
): AppData {
  const deduped = dedupeDescontosContaCoopRemotos(descontos);
  return {
    ...data,
    arquivosMensais: upsertArquivoMensal(data, cooperadoId, cooperativaId, mesReferencia, {
      contaCoopDescontos: deduped.map((d) => ({
        motivo: d.motivo,
        valorReais: d.valorReais,
        tipo: d.motivo.toLowerCase().includes("estorno") ? ("credito_avulso" as const) : ("conta_coop" as const),
        createdAt: d.createdAt,
      })),
    }),
  };
}

export function getMesesReferenciaPagamento(pagamento: PagamentoCooperadoRegistro): string[] {
  if (pagamento.mesesReferencia?.length) {
    return [...pagamento.mesesReferencia].sort();
  }
  return [pagamento.mesReferencia];
}

export function pagamentoCobreMesReferencia(
  pagamento: PagamentoCooperadoRegistro,
  mesReferencia: string
): boolean {
  return getMesesReferenciaPagamento(pagamento).includes(mesReferencia);
}

/** Soma resumos de todos os meses pendentes (PIX único). */
export function getResumoPagamentoConsolidadoCooperado(
  data: AppData,
  cooperadoId: string,
  mesesReferencia: string[],
  cooperativaId?: string,
  ajustesPorMes?: Record<string, AjustesResumoPagamento>
): ResumoPagamentoCooperado {
  const meses = [...mesesReferencia].sort();
  if (!meses.length) {
    return {
      valorBruto: 0,
      descontoCooperativa: 0,
      descontosExtras: [],
      valorEntregas: 0,
      valorLiquido: 0,
      fichaIds: [],
      notaPedidoIds: [],
    };
  }
  if (meses.length === 1) {
    const base = getResumoPagamentoCooperado(
      data,
      cooperadoId,
      meses[0],
      cooperativaId,
      ajustesPorMes?.[meses[0]]
    );
    return getResumoPagamentoParaRegistro(base, data, cooperadoId, meses[0], cooperativaId);
  }

  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  let valorBruto = 0;
  let descontoCooperativa = 0;
  let valorEntregas = 0;
  let valorLiquido = 0;
  const descontosExtras: FichaCorridaDesconto[] = [];
  const fichaIds: string[] = [];
  const notaPedidoIds: string[] = [];

  for (const mes of meses) {
    const base = getResumoPagamentoCooperado(data, cooperadoId, mes, coopId, ajustesPorMes?.[mes]);
    const r = getResumoPagamentoParaRegistro(base, data, cooperadoId, mes, coopId);
    valorBruto = round2(valorBruto + r.valorBruto);
    descontoCooperativa = round2(descontoCooperativa + r.descontoCooperativa);
    valorEntregas = round2(valorEntregas + r.valorEntregas);
    valorLiquido = round2(valorLiquido + r.valorLiquido);
    descontosExtras.push(...r.descontosExtras);
    fichaIds.push(...r.fichaIds);
    for (const id of r.notaPedidoIds) {
      if (!notaPedidoIds.includes(id)) notaPedidoIds.push(id);
    }
  }

  return {
    valorBruto,
    descontoCooperativa,
    descontosExtras: dedupeDescontosExtrasContaCoop(descontosExtras),
    valorEntregas,
    valorLiquido,
    fichaIds,
    notaPedidoIds,
  };
}

export function getPagamentoAguardandoCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string
): PagamentoCooperadoRegistro | undefined {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  return data.pagamentosCooperado.find(
    (p) =>
      (p.cooperadoId === cooperadoId ||
        p.cooperadoId === canonico ||
        resolverCooperadoIdCanonico(data, p.cooperadoId, coopId ?? p.cooperativaId) === canonico) &&
      p.status === "aguardando_confirmacao" &&
      (!mesReferencia || pagamentoCobreMesReferencia(p, mesReferencia))
  );
}

export function aplicarItensNaNota(
  nota: NotaPedido,
  itensForm: NotaPedidoItem[],
  percentualDesconto: number,
  extras?: Partial<NotaPedido>
): NotaPedido {
  const calc = calcularItensNota(itensForm, percentualDesconto);
  return {
    ...nota,
    ...extras,
    itens: calc.itens,
    valorBruto: calc.valorBruto,
    percentualDescontoCooperativa: percentualDesconto,
    valorDesconto: calc.valorDesconto,
    valorLiquido: calc.valorLiquido,
    updatedAt: new Date().toISOString(),
  };
}

/** Soma itens lançados em várias fotos da mesma entrega. */
export function consolidarItensLancamentoPorFoto(
  lancamentos: NotaPedidoItem[][]
): NotaPedidoItem[] {
  const map = new Map<string, NotaPedidoItem>();
  for (const lista of lancamentos) {
    for (const item of lista) {
      if (item.quantidade <= 0) continue;
      const prev = map.get(item.produtoInstituicaoId);
      if (prev) {
        map.set(item.produtoInstituicaoId, {
          ...prev,
          quantidade: round2(prev.quantidade + item.quantidade),
          valorBruto: round2(prev.valorBruto + item.valorBruto),
        });
      } else {
        map.set(item.produtoInstituicaoId, { ...item });
      }
    }
  }
  return [...map.values()];
}

export function registrarPagamentoCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  responsavel: string,
  resumoOverride?: ResumoPagamentoCooperado,
  opts?: { mesesReferencia?: string[] }
): AppData {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const mesesPagamento = opts?.mesesReferencia?.length
    ? [...opts.mesesReferencia].sort()
    : [mesReferencia];
  const mesPrincipal = mesesPagamento[0] ?? mesReferencia;
  const resumo =
    resumoOverride ??
    (mesesPagamento.length > 1
      ? getResumoPagamentoConsolidadoCooperado(data, cooperadoCanonico, mesesPagamento, coopId)
      : getResumoPagamentoCooperado(data, cooperadoCanonico, mesPrincipal, coopId));
  if (resumo.valorLiquido <= 0 || resumo.fichaIds.length === 0) return data;

  const now = new Date().toISOString();
  const cooperado = data.cooperados.find((c) => c.id === cooperadoCanonico);
  const coopIdResolved = cooperado?.cooperativaId ?? coopId ?? "";
  const mesLabel = formatMesesReferenciaRotulo(mesesPagamento);

  const pagamento: PagamentoCooperadoRegistro = {
    id: `pg_${Date.now()}`,
    cooperativaId: coopIdResolved,
    cooperadoId: cooperadoCanonico,
    mesReferencia: mesPrincipal,
    mesesReferencia: mesesPagamento.length > 1 ? mesesPagamento : undefined,
    valorBruto: resumo.valorBruto,
    descontoCooperativa: resumo.descontoCooperativa,
    descontosExtras: resumo.descontosExtras,
    valorLiquido: resumo.valorLiquido,
    fichaIds: resumo.fichaIds,
    notaPedidoIds: resumo.notaPedidoIds,
    status: "aguardando_confirmacao",
    pagoPor: responsavel,
    pagoEm: now,
    createdAt: now,
    updatedAt: now,
  };

  let next = data;
  for (const mes of mesesPagamento) {
    next = marcarFichaComoPaga(next, cooperadoCanonico, mes, responsavel);
    next = marcarValoresAvulsosPagosMes(next, cooperadoCanonico, mes, coopIdResolved);
  }

  const comunicado: Comunicado = {
    id: `cm_${Date.now()}`,
    cooperativaId: coopIdResolved,
    cooperadoId: cooperadoCanonico,
    titulo: "Pagamento realizado",
    descricao: `A cooperativa registrou o pagamento de ${resumo.valorLiquido.toFixed(2).replace(".", ",")} referente a ${mesLabel}. Abra Quanto vou receber, confirme o recebimento e assine o recibo.`,
    data: now.split("T")[0],
    responsavel,
    categoria: "financeiro",
    fixado: true,
    visivelParaTodos: false,
    ativo: true,
    createdAt: now,
  };

  next = {
    ...next,
    pagamentosCooperado: [...next.pagamentosCooperado, pagamento],
    comunicados: [...next.comunicados, comunicado],
  };

  for (const mes of mesesPagamento) {
    next = {
      ...next,
      arquivosMensais: upsertArquivoMensal(next, cooperadoCanonico, coopIdResolved, mes, {
        notaPedidoIds: resumo.notaPedidoIds,
      }),
    };
  }

  return lancarPagamentoCooperadoNoCaixa(next, pagamento);
}

export function confirmarPagamentoCooperado(
  data: AppData,
  pagamentoId: string,
  assinaturaDataUrl: string
): AppData {
  const pagamento = data.pagamentosCooperado.find((p) => p.id === pagamentoId);
  if (!pagamento || pagamento.status !== "aguardando_confirmacao") return data;

  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  if (!cooperado) return data;

  const now = new Date().toISOString();
  const draft = {
    ...pagamento,
    assinaturaCooperado: assinaturaDataUrl,
    assinadoEm: now,
    status: "confirmado" as const,
    updatedAt: now,
  };
  const itensMes = agregarItensFichaMeses(
    data,
    pagamento.cooperadoId,
    getMesesReferenciaPagamento(pagamento),
    pagamento.cooperativaId
  );
  const resumoRecibo = resumoReciboFromPagamento(draft, itensMes);
  const reciboHtml = gerarReciboHtml(
    draft,
    cooperado,
    data.cooperativas.find((c) => c.id === pagamento.cooperativaId)?.nome ?? "Cooperativa",
    resumoRecibo,
    data.config.descontoPadraoCooperativa
  );

  const pagamentosCooperado = data.pagamentosCooperado.map((p) =>
    p.id === pagamentoId
      ? { ...draft, reciboHtml, status: "confirmado" as const, updatedAt: now }
      : p
  );

  let next: AppData = {
    ...data,
    pagamentosCooperado,
  };

  for (const mes of getMesesReferenciaPagamento(pagamento)) {
    next = marcarFichaComoPaga(next, pagamento.cooperadoId, mes, pagamento.pagoPor ?? "Cooperativa");
    next = {
      ...next,
      arquivosMensais: upsertArquivoMensal(next, pagamento.cooperadoId, pagamento.cooperativaId, mes, {
        pagamentoIds: [pagamentoId],
      }),
    };
  }

  const coopId = pagamento.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(next, pagamento.cooperadoId, coopId);
  next = {
    ...next,
    comunicados: next.comunicados.map((c) => {
      const paraCooperado =
        !c.cooperadoId || c.cooperadoId === pagamento.cooperadoId || c.cooperadoId === canonico;
      const avisoPagamento =
        c.categoria === "financeiro" &&
        c.titulo.trim().toLowerCase() === "pagamento realizado";
      if (paraCooperado && avisoPagamento && c.cooperativaId === coopId) {
        return { ...c, ativo: false };
      }
      return c;
    }),
  };

  return next;
}

export function marcarFichaComoPaga(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  _responsavel: string
): AppData {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const now = new Date().toISOString();
  const fichaAtualizada = data.fichaCorrida.map((f) =>
    fichaPertenceCooperado(data, f, cooperadoId, coopId) &&
    f.mesReferencia === mesReferencia &&
    f.status === "pendente"
      ? { ...f, status: "pago" as const }
      : f
  );
  const notaIds = fichaAtualizada
    .filter(
      (f) =>
        fichaPertenceCooperado(data, f, cooperadoId, coopId) &&
        f.mesReferencia === mesReferencia &&
        f.status === "pago"
    )
    .map((f) => f.notaPedidoId);
  const notasPedido = data.notasPedido.map((n) =>
    notaIds.includes(n.id) && (n.status === "conferida" || n.status === "pago")
      ? { ...n, status: "pago" as const, updatedAt: now }
      : n
  );
  return { ...data, fichaCorrida: fichaAtualizada, notasPedido };
}

export type MotivoBloqueioExclusaoEntrega =
  | "not_found"
  | "wrong_coop"
  | "pago"
  | "ficha_paga"
  | "em_pagamento";

function recalcularSaldosFichaCooperadoMes(
  fichas: FichaCorrida[],
  cooperadoId: string,
  mesReferencia: string
): FichaCorrida[] {
  const ordenadas = fichas
    .filter((f) => f.cooperadoId === cooperadoId && f.mesReferencia === mesReferencia)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let saldo = 0;
  const saldoPorId = new Map<string, number>();
  for (const f of ordenadas) {
    saldo = round2(saldo + f.valorLiquido);
    saldoPorId.set(f.id, saldo);
  }

  return fichas.map((f) => {
    const novoSaldo = saldoPorId.get(f.id);
    return novoSaldo !== undefined ? { ...f, saldoAcumulado: novoSaldo } : f;
  });
}

/** Verifica se a entrega pode ser excluída pela cooperativa (responsável). */
export function podeExcluirEntregaNota(
  data: AppData,
  notaId: string,
  cooperativaId: string
): { ok: true } | { ok: false; reason: MotivoBloqueioExclusaoEntrega } {
  const nota = data.notasPedido.find((n) => n.id === notaId);
  if (!nota) return { ok: false, reason: "not_found" };
  if (nota.cooperativaId !== cooperativaId) return { ok: false, reason: "wrong_coop" };
  if (nota.status === "pago") return { ok: false, reason: "pago" };

  const fichas = data.fichaCorrida.filter((f) => f.notaPedidoId === notaId);
  if (fichas.some((f) => f.status === "pago")) return { ok: false, reason: "ficha_paga" };

  if (data.pagamentosCooperado.some((p) => p.notaPedidoIds.includes(notaId))) {
    return { ok: false, reason: "em_pagamento" };
  }

  return { ok: true };
}

export function idsNotasPedidoExcluidas(data: AppData, cooperativaId?: string): Set<string> {
  let items = data.notasPedidoExcluidas ?? [];
  if (cooperativaId) items = items.filter((e) => e.cooperativaId === cooperativaId);
  return new Set(items.map((e) => e.id));
}

export function isNotaPedidoExcluida(data: AppData, notaId: string, cooperativaId?: string): boolean {
  return idsNotasPedidoExcluidas(data, cooperativaId).has(notaId);
}

export function registrarNotaPedidoExcluida(
  data: AppData,
  notaId: string,
  cooperativaId: string
): AppData {
  const existing = data.notasPedidoExcluidas ?? [];
  const now = new Date().toISOString();
  const entry: NotaPedidoExcluida = { id: notaId, cooperativaId, deletedAt: now };
  const idx = existing.findIndex((e) => e.id === notaId && e.cooperativaId === cooperativaId);
  if (idx >= 0) {
    const next = [...existing];
    next[idx] = entry;
    return { ...data, notasPedidoExcluidas: next };
  }
  return { ...data, notasPedidoExcluidas: [...existing, entry] };
}

export function removerNotaPedidoExcluida(
  data: AppData,
  notaId: string,
  cooperativaId: string
): AppData {
  return {
    ...data,
    notasPedidoExcluidas: (data.notasPedidoExcluidas ?? []).filter(
      (e) => !(e.id === notaId && e.cooperativaId === cooperativaId)
    ),
  };
}

/** Remove entregas tombstonadas após exclusão — evita reaparecer na fila de conferência. */
export function aplicarNotasPedidoExcluidas(data: AppData, cooperativaId?: string): AppData {
  const excl = idsNotasPedidoExcluidas(data, cooperativaId);
  if (excl.size === 0) return data;
  const notasPedido = data.notasPedido.filter((n) => !excl.has(n.id));
  if (notasPedido.length === data.notasPedido.length) return data;
  return { ...data, notasPedido };
}

/** Remove entrega, fichas vinculadas e referências mensais; recalcula saldos afetados. */
export function excluirEntregaNota(
  data: AppData,
  notaId: string,
  cooperativaId: string
): { ok: true; data: AppData } | { ok: false; reason: MotivoBloqueioExclusaoEntrega } {
  const check = podeExcluirEntregaNota(data, notaId, cooperativaId);
  if (!check.ok) return check;

  const nota = data.notasPedido.find((n) => n.id === notaId)!;
  const { fichaCorrida, arquivosMensais } = removerFichasNotaERecalcular(data, nota);

  const notasPedido = data.notasPedido.filter((n) => n.id !== notaId);

  return {
    ok: true,
    data: registrarNotaPedidoExcluida(
      { ...data, notasPedido, fichaCorrida, arquivosMensais },
      notaId,
      cooperativaId
    ),
  };
}

export function mensagemBloqueioExclusaoEntrega(reason: MotivoBloqueioExclusaoEntrega): string {
  switch (reason) {
    case "not_found":
      return "Entrega não encontrada.";
    case "wrong_coop":
      return "Esta entrega não pertence à sua cooperativa.";
    case "pago":
      return "Entrega já paga — não pode ser alterada.";
    case "ficha_paga":
      return "Há lançamento pago na ficha — não pode alterar.";
    case "em_pagamento":
      return "Entrega incluída em um pagamento — cancele o pagamento antes.";
    default:
      return "Não foi possível alterar esta entrega.";
  }
}

function cooperadosAfetadosPelaNota(data: AppData, nota: NotaPedido): Set<string> {
  const ids = new Set<string>([nota.cooperadoId]);
  for (const f of data.fichaCorrida.filter((x) => x.notaPedidoId === nota.id)) {
    ids.add(f.cooperadoId);
  }
  for (const p of nota.divisaoEntrega?.participantes ?? []) {
    ids.add(p.cooperadoId);
  }
  return ids;
}

function removerFichasNotaERecalcular(
  data: AppData,
  nota: NotaPedido
): Pick<AppData, "fichaCorrida" | "arquivosMensais"> {
  let fichaCorrida = data.fichaCorrida.filter((f) => f.notaPedidoId !== nota.id);
  for (const cooperadoAfetadoId of cooperadosAfetadosPelaNota(data, nota)) {
    fichaCorrida = recalcularSaldosFichaCooperadoMes(
      fichaCorrida,
      cooperadoAfetadoId,
      nota.mesReferencia
    );
  }
  const arquivosMensais = data.arquivosMensais.map((a) => ({
    ...a,
    notaPedidoIds: a.notaPedidoIds.filter((id) => id !== nota.id),
  }));
  return { fichaCorrida, arquivosMensais };
}

/** Entrega lançada (conferida) ou devolvida para correção pode voltar à fila — exceto paga/em pagamento. */
export function podeRelancarEntregaNota(
  data: AppData,
  notaId: string,
  cooperativaId: string
): { ok: true } | { ok: false; reason: MotivoBloqueioExclusaoEntrega } {
  const nota = data.notasPedido.find((n) => n.id === notaId);
  if (!nota) return { ok: false, reason: "not_found" };
  if (nota.cooperativaId !== cooperativaId) return { ok: false, reason: "wrong_coop" };
  if (nota.status !== "conferida" && nota.status !== "rejeitada") {
    return { ok: false, reason: "not_found" };
  }

  const check = podeExcluirEntregaNota(data, notaId, cooperativaId);
  if (!check.ok) return check;
  return { ok: true };
}

/** Remove lançamento da ficha e devolve a nota à fila (aguardando conferência), mantendo fotos. */
export function relancarEntregaNota(
  data: AppData,
  notaId: string,
  cooperativaId: string
): { ok: true; data: AppData; nota: NotaPedido } | { ok: false; reason: MotivoBloqueioExclusaoEntrega } {
  const check = podeRelancarEntregaNota(data, notaId, cooperativaId);
  if (!check.ok) return check;

  const nota = data.notasPedido.find((n) => n.id === notaId)!;
  const { fichaCorrida, arquivosMensais } = removerFichasNotaERecalcular(data, nota);
  const descontoPadrao = data.config?.descontoPadraoCooperativa ?? nota.percentualDescontoCooperativa ?? 5;

  const notaRelancada: NotaPedido = {
    ...nota,
    status: "aguardando_conferencia",
    itens: [],
    valorBruto: 0,
    valorDesconto: 0,
    valorLiquido: 0,
    percentualDescontoCooperativa: descontoPadrao,
    conferidaPor: undefined,
    dataConferencia: undefined,
    divisaoEntrega: undefined,
    rejeitadaPor: undefined,
    dataRejeicao: undefined,
    motivoRejeicao: undefined,
    relancadaEm: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const notasPedido = data.notasPedido.map((n) => (n.id === notaId ? notaRelancada : n));

  return {
    ok: true,
    nota: notaRelancada,
    data: removerNotaPedidoExcluida(
      { ...data, notasPedido, fichaCorrida, arquivosMensais },
      notaId,
      cooperativaId
    ),
  };
}

export function notaEnvolveCooperadoCorrecao(
  data: AppData,
  nota: NotaPedido,
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const dono = resolverCooperadoIdCanonico(
    data,
    nota.cooperadoId,
    cooperativaId,
    nota.cooperadoNomeSnapshot
  );
  if (dono === canon) return true;
  return (
    nota.divisaoEntrega?.participantes.some(
      (p) => resolverCooperadoIdCanonico(data, p.cooperadoId, cooperativaId) === canon
    ) ?? false
  );
}

export function listarEntregasCorrecaoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  acao: "apagar" | "relancar"
): NotaPedido[] {
  return data.notasPedido
    .filter((n) => {
      if (n.cooperativaId !== cooperativaId) return false;
      if (!notaEnvolveCooperadoCorrecao(data, n, cooperadoId, cooperativaId)) return false;
      if (acao === "relancar") {
        return podeRelancarEntregaNota(data, n.id, cooperativaId).ok;
      }
      return podeExcluirEntregaNota(data, n.id, cooperativaId).ok;
    })
    .sort((a, b) => new Date(b.dataEntrega).getTime() - new Date(a.dataEntrega).getTime());
}
