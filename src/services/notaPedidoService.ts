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
import {
  valoresAvulsosPendentesMes,
  marcarValoresAvulsosPagosMes,
  mesesComValoresAvulsos,
} from "@/services/valoresAvulsosReceberService";
import { round2 } from "@/utils/calculations";
import { isDivisaoEntregaHabilitada } from "@/lib/conferencia/divisaoEntregaPolicy";
import { gerarReciboHtml, resumoReciboFromPagamento } from "@/utils/recibo";
import { lancarPagamentoCooperadoNoCaixa } from "@/services/livroCaixaService";
import { textoDescontoMensalidadeFicha } from "@/config/contaCoopEconomia";
import type { DescontoContaCoopRemoto } from "@/lib/hb-credit/mergeFichaDescontos";
import {
  descontosContaCoopFromArquivo,
  descontosContaCoopLinhasExibicao,
  dedupeDescontosContaCoopRemotos,
  dedupeArquivoContaCoopDescontos,
  dedupeDescontosExtrasContaCoop,
  filtrarDescontosContaCoopParaMesReferencia,
  mergeDescontosContaCoopNoResumo,
  mergeContaCoopDescontosFieldSync,
} from "@/lib/hb-credit/mergeFichaDescontos";
import {
  getContaCoopDescontosMemoria,
  hasContaCoopDescontosMemoria,
  resolveDescontosContaCoopMesParaCalculo,
} from "@/lib/hb-credit/contaCoopDescontosMemory";
import { contaCoopDescontosMesFetchAutoritativo } from "@/lib/hb-credit/contaCoopDescontosSyncHealth";
import { formatMesesReferenciaRotulo } from "@/utils/format";
import { fichaPreservarSemNotaLocal, notasSyncProvavelmenteCompleto } from "@/services/fichaSyncGuard";
import { isCloudSyncInProgress } from "@/services/cloudSyncProgress";
import { contarFotosEnviadasNota } from "@/utils/fotoEntrega";
import { descricaoFichaCorrespondeFoto } from "@/lib/conferencia/conferenciaFichaHydrate";

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
  const key =
    item.produtoInstituicaoId ||
    `${(item.produtoNome ?? "").trim()}::${(item.unidade ?? "").trim()}`;
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

/** Itens do recibo a partir das fichas registradas no pagamento (valores congelados no PIX). */
export function agregarItensFromFichaIds(
  data: AppData,
  fichaIds: string[]
): { itens: ItemResumoFichaMes[]; entregas: number; valorBruto: number } {
  const map = new Map<string, ItemResumoFichaMes>();
  let entregas = 0;
  for (const id of fichaIds) {
    const ficha = data.fichaCorrida.find((f) => f.id === id);
    if (!ficha) continue;
    entregas += 1;
    for (const item of ficha.itens ?? []) {
      mesclarItemResumo(map, item);
    }
  }
  const itens = [...map.values()].sort((a, b) =>
    a.produtoNome.localeCompare(b.produtoNome, "pt-BR")
  );
  const valorBruto = round2(itens.reduce((s, i) => s + i.valorBruto, 0));
  return { itens, entregas, valorBruto };
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
      const key =
        item.produtoInstituicaoId ||
        `${(item.produtoNome ?? "").trim()}::${(item.unidade ?? "").trim()}`;
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
      const key =
        item.produtoInstituicaoId ||
        `${(item.produtoNome ?? "").trim()}::${(item.unidade ?? "").trim()}`;
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

const TOL_NOTA_TOTAIS_ITENS = 0.02;

/** Totais da nota batem com quantidade × preço e desconto por linha (tolerância de centavos). */
export function notaTotaisCoerentesComItens(
  nota: Pick<
    NotaPedido,
    "itens" | "valorBruto" | "valorLiquido" | "valorDesconto" | "percentualDescontoCooperativa"
  >
): boolean {
  const itens = nota.itens ?? [];
  if (!itens.some((i) => (i.quantidade ?? 0) > 0)) return true;
  const calc = calcularItensNota(itens, nota.percentualDescontoCooperativa ?? 0);
  return (
    Math.abs(calc.valorBruto - (nota.valorBruto ?? 0)) <= TOL_NOTA_TOTAIS_ITENS &&
    Math.abs(calc.valorLiquido - (nota.valorLiquido ?? 0)) <= TOL_NOTA_TOTAIS_ITENS &&
    Math.abs(calc.valorDesconto - (nota.valorDesconto ?? 0)) <= TOL_NOTA_TOTAIS_ITENS
  );
}

/** Recalcula bruto/desconto/líquido e valorBruto das linhas a partir dos itens (fonte única). */
export function normalizarTotaisNotaDesdeItens(nota: NotaPedido): NotaPedido {
  const itens = nota.itens ?? [];
  if (!itens.some((i) => (i.quantidade ?? 0) > 0)) return nota;
  const pct = nota.percentualDescontoCooperativa ?? 0;
  const calc = calcularItensNota(itens, pct);
  const sameTotals = notaTotaisCoerentesComItens(nota);
  const sameItems = JSON.stringify(calc.itens) === JSON.stringify(nota.itens);
  if (sameTotals && sameItems) return nota;
  return {
    ...nota,
    itens: calc.itens,
    valorBruto: calc.valorBruto,
    valorDesconto: calc.valorDesconto,
    valorLiquido: calc.valorLiquido,
    percentualDescontoCooperativa: pct,
    updatedAt: new Date().toISOString(),
  };
}

/** Notas conferidas/pagas: totais desde itens; se itens vazios, recupera da ficha. */
export function normalizarIntegridadeNotasLancadas(data: AppData): AppData {
  let changed = false;
  const notasPedido = data.notasPedido.map((nota) => {
    if (nota.status !== "conferida" && nota.status !== "pago") return nota;
    let next = normalizarTotaisNotaDesdeItens(nota);
    const semItens = !(next.itens ?? []).some((i) => (i.quantidade ?? 0) > 0);
    const fichas = data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
    if (semItens && fichas.length > 0) {
      next = sincronizarTotaisNotaComFichas(next, fichas, {
        sincronizarItens: true,
        forcarDescontoLiquido: true,
        sincronizarBruto: true,
      });
      const aindaSemItens = !(next.itens ?? []).some((i) => (i.quantidade ?? 0) > 0);
      if (aindaSemItens) {
        const itensFicha = consolidarItensDeFichasNota(fichas, nota.id);
        if (itensFicha.length > 0) {
          next = aplicarItensNaNota(next, itensFicha, next.percentualDescontoCooperativa ?? 0);
        }
      }
      next = normalizarTotaisNotaDesdeItens(next);
    }
    if (
      next.valorBruto !== nota.valorBruto ||
      next.valorLiquido !== nota.valorLiquido ||
      next.valorDesconto !== nota.valorDesconto ||
      JSON.stringify(next.itens) !== JSON.stringify(nota.itens)
    ) {
      changed = true;
    }
    return next;
  });
  if (!changed) return data;
  return { ...data, notasPedido };
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
      motivo: textoDescontoMensalidadeFicha(mesReferencia, m.valor),
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
      | "contaCoopDescontosUpdatedAt"
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
      contaCoopDescontosUpdatedAt: patch.contaCoopDescontosUpdatedAt,
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
    contaCoopDescontosUpdatedAt:
      patch.contaCoopDescontosUpdatedAt !== undefined
        ? patch.contaCoopDescontosUpdatedAt
        : cur.contaCoopDescontosUpdatedAt,
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

function contaCoopDescontosHbTime(arquivo: ArquivoMensalCooperado): number {
  const stamp = arquivo.contaCoopDescontosUpdatedAt;
  if (stamp) {
    const parsed = Date.parse(stamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const list = arquivo.contaCoopDescontos ?? [];
  if (!list.length) return 0;
  return Math.max(
    ...list.map((d) => {
      const t = d.createdAt ? Date.parse(d.createdAt) : 0;
      return Number.isNaN(t) ? 0 : t;
    })
  );
}

function mergeContaCoopDescontosField(
  localArquivo: ArquivoMensalCooperado,
  cloudArquivo: ArquivoMensalCooperado
): ArquivoMensalCooperado["contaCoopDescontos"] {
  const localList = localArquivo.contaCoopDescontos ?? [];
  const cloudList = cloudArquivo.contaCoopDescontos ?? [];
  if (!localList.length && !cloudList.length) return undefined;

  const merged = mergeContaCoopDescontosFieldSync(
    descontosContaCoopFromArquivo({ contaCoopDescontos: localList }),
    descontosContaCoopFromArquivo({ contaCoopDescontos: cloudList })
  );
  if (!merged.length) return undefined;
  return dedupeArquivoContaCoopDescontos(
    merged.map((d) => ({
      motivo: d.motivo,
      valorReais: d.valorReais,
      tipo: d.motivo.toLowerCase().includes("estorno") ? ("credito_avulso" as const) : ("conta_coop" as const),
      createdAt: d.createdAt,
      ...(d.hbTransactionId ? { hbTransactionId: d.hbTransactionId } : {}),
    }))
  );
}

function mergeParArquivoMensal(
  data: AppData,
  a: ArquivoMensalCooperado,
  b: ArquivoMensalCooperado,
  hbSides?: { local: ArquivoMensalCooperado; cloud: ArquivoMensalCooperado }
): ArquivoMensalCooperado {
  const hbLocal = hbSides?.local ?? a;
  const hbCloud = hbSides?.cloud ?? b;
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
    contaCoopDescontos: mergeContaCoopDescontosField(hbLocal, hbCloud),
    contaCoopDescontosUpdatedAt:
      contaCoopDescontosHbTime(a) >= contaCoopDescontosHbTime(b)
        ? a.contaCoopDescontosUpdatedAt ?? b.contaCoopDescontosUpdatedAt
        : b.contaCoopDescontosUpdatedAt ?? a.contaCoopDescontosUpdatedAt,
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
    map.set(key, cur ? mergeParArquivoMensal(data, cur, normalized, { local: cur, cloud: normalized }) : normalized);
  }

  for (const item of localCoop) {
    const key = arquivoMensalSyncKey(data, item);
    const cur = map.get(key);
    map.set(key, cur ? mergeParArquivoMensal(data, cur, item, { local: item, cloud: cur }) : item);
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

/** Id determinístico — mesma nota/cooperado/fatia → mesma ficha (idempotência). */
export function idEstavelFichaCorrida(
  notaPedidoId: string,
  cooperadoId: string,
  opts?: { fotoIndex?: number; participanteIndex?: number }
): string {
  let id = `fc_np_${notaPedidoId}_co_${cooperadoId}`;
  if (opts?.participanteIndex != null && opts.participanteIndex >= 0) {
    id += `_p${opts.participanteIndex}`;
  }
  if (opts?.fotoIndex != null && opts.fotoIndex >= 0) {
    id += `_f${opts.fotoIndex}`;
  }
  return id;
}

function encontrarFichaExistenteParaLancamento(
  data: AppData,
  nota: NotaPedido,
  cooperadoId: string,
  opts?: { fotoIndex?: number; totalFotos?: number; participanteIndex?: number }
): FichaCorrida | undefined {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, nota.cooperativaId);
  const candidatas = data.fichaCorrida.filter(
    (f) =>
      f.notaPedidoId === nota.id &&
      resolverCooperadoIdCanonico(data, f.cooperadoId, nota.cooperativaId) === canon
  );
  if (!candidatas.length) return undefined;
  if (opts?.fotoIndex != null && opts.totalFotos != null && opts.totalFotos > 1) {
    const porFoto = candidatas.find((f) =>
      descricaoFichaCorrespondeFoto(f.descricao, opts.fotoIndex!, opts.totalFotos!)
    );
    if (porFoto) return porFoto;
  }
  const estavel = idEstavelFichaCorrida(nota.id, cooperadoId, opts);
  const porId = candidatas.find((f) => f.id === estavel);
  if (porId) return porId;
  if (candidatas.length === 1) return candidatas[0];
  const semFoto = candidatas.find((f) => !/\(foto\s+\d/i.test(f.descricao));
  return semFoto ?? candidatas[0];
}

export function buildFichaFromNota(
  nota: NotaPedido,
  data: AppData,
  responsavel: string,
  cooperadoNome?: string,
  opts?: { fotoIndex?: number; totalFotos?: number; participanteIndex?: number }
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
  const cooperadoCanonico = nota.cooperadoId;
  const existente = encontrarFichaExistenteParaLancamento(data, nota, cooperadoCanonico, opts);
  const id =
    existente?.id ??
    idEstavelFichaCorrida(nota.id, cooperadoCanonico, {
      fotoIndex: opts?.fotoIndex,
      participanteIndex: opts?.participanteIndex,
    });
  const createdAt = existente?.createdAt ?? new Date().toISOString();
  return {
    id,
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
    createdAt,
    ...(existente?.status === "pago"
      ? {
          status: "pago" as const,
          updatedAt: existente.updatedAt,
        }
      : {}),
  };
}

function getUltimoDiaMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-");
  const lastDay = new Date(parseInt(ano), parseInt(mes), 0).getDate();
  return `${mesReferencia}-${String(lastDay).padStart(2, "0")}`;
}

/** Rateio igual do valor da entrega (mesma regra das fichas divididas). */
export function dividirValorEntrega(total: number, index: number, count: number): number {
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

/**
 * Fatia de rateio: quantidade só para exibição; autoridade monetária é o valorBruto
 * já dividido (e o desconto por linha da nota, também dividido). Não refaz qty×preço.
 */
function calcularItensFatiaRateio(
  itensOriginais: NotaPedidoItem[],
  index: number,
  count: number,
  percentualDesconto: number
): { itens: NotaPedidoItem[]; valorBruto: number; valorDesconto: number; valorLiquido: number } {
  const itens: NotaPedidoItem[] = [];
  let valorBruto = 0;
  let valorDesconto = 0;
  for (const item of itensOriginais) {
    if (item.quantidade <= 0) continue;
    const quantidade = dividirValorEntrega(item.quantidade, index, count);
    if (quantidade <= 0) continue;
    const brutoFatia = dividirValorEntrega(item.valorBruto, index, count);
    const descLinhaNota = round2(item.valorBruto * (percentualDesconto / 100));
    const descFatia = dividirValorEntrega(descLinhaNota, index, count);
    itens.push({ ...item, quantidade, valorBruto: brutoFatia });
    valorBruto = round2(valorBruto + brutoFatia);
    valorDesconto = round2(valorDesconto + descFatia);
  }
  return {
    itens,
    valorBruto,
    valorDesconto,
    valorLiquido: round2(valorBruto - valorDesconto),
  };
}

/**
 * Recupera divisaoEntrega da nota ou das fichas já lançadas (multi-foto sem metadado na nota).
 */
export function inferirDivisaoEntregaDasFichas(
  data: AppData,
  nota: NotaPedido,
  fichasNota?: FichaCorrida[]
): DivisaoEntregaNota | undefined {
  if (!isDivisaoEntregaHabilitada()) return undefined;

  if ((nota.divisaoEntrega?.participantes.length ?? 0) > 1) {
    return nota.divisaoEntrega;
  }
  const fichas =
    fichasNota ?? data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
  if (!fichas.length) return undefined;

  const fromFicha = fichas.find(
    (f) => (f.divisaoEntrega?.participantes.length ?? 0) > 1
  )?.divisaoEntrega;
  if (fromFicha && fromFicha.participantes.length > 1) return fromFicha;

  const coopId = nota.cooperativaId;
  const ids = [
    ...new Set(
      fichas.map((f) => resolverCooperadoIdCanonico(data, f.cooperadoId, coopId))
    ),
  ];
  if (ids.length < 2) return undefined;

  const origemId = resolverCooperadoIdCanonico(data, nota.cooperadoId, coopId);
  const origemNome =
    nota.cooperadoNomeSnapshot?.trim() ||
    getCooperadoNomeResolvido(data, origemId, coopId);
  return criarDivisaoEntregaFromParticipantes(data, coopId, origemId, origemNome, ids);
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
    const base = buildFichaFromNota(notaParticipante, ctx, responsavel, p.cooperadoNome, {
      ...opts,
      participanteIndex: i,
    });
    const calc = calcularItensFatiaRateio(
      nota.itens ?? [],
      i,
      N,
      nota.percentualDescontoCooperativa
    );
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
    ficha.status = statusFichaAposConferenciaNota(data, nota, p.cooperadoId);
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
    const calc = calcularItensFatiaRateio(
      nota.itens ?? [],
      i,
      totalFotos,
      nota.percentualDescontoCooperativa
    );
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
    ficha.status = statusFichaAposConferenciaNota(data, nota, nota.cooperadoId);
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

/**
 * Fechamento multi-foto: preserva cada lançamento parcial (foto i/N) já gravado na ficha.
 * Evita `buildFichasMultiFotoFromNota`, que rateia o total e distorce quantidades por foto.
 */
export function finalizarFichasConferenciaMultiFoto(data: AppData, nota: NotaPedido): AppData {
  const total = contarFotosEnviadasNota(nota);
  if (total <= 1) return rebuildFichasNota(data, nota);

  const without = data.fichaCorrida.filter((f) => f.notaPedidoId !== nota.id);
  const existentes = data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
  const novasFichas: FichaCorrida[] = [];
  let ctxFicha: FichaCorrida[] = [...without];

  for (let i = 0; i < total; i++) {
    const hit = existentes.find((f) => descricaoFichaCorrespondeFoto(f.descricao, i, total));
    if (!hit) return rebuildFichasNota(data, nota);

    const pct = hit.percentualDescontoCooperativa ?? nota.percentualDescontoCooperativa ?? 0;
    const calc = hit.itens?.length
      ? calcularItensNota(hit.itens, pct)
      : {
          itens: hit.itens ?? [],
          valorBruto: hit.valorBruto,
          valorDesconto: hit.descontos,
          valorLiquido: hit.valorLiquido,
        };
    const ctx = { ...data, fichaCorrida: ctxFicha };
    const saldoAnterior = getSaldoAnteriorFicha(ctx, nota.cooperadoId, nota.mesReferencia, nota.id);
    novasFichas.push({
      ...hit,
      valorBruto: calc.valorBruto,
      descontos: calc.valorDesconto,
      valorLiquido: calc.valorLiquido,
      itens: calc.itens,
      status: statusFichaAposConferenciaNota(data, nota, nota.cooperadoId),
      saldoAcumulado: round2(saldoAnterior + calc.valorLiquido),
      responsavelConferencia: nota.conferidaPor ?? hit.responsavelConferencia,
    });
    ctxFicha = [...without, ...novasFichas];
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

/** Recria fichas da nota (1 ou N cooperados conforme divisaoEntrega). */
export function rebuildFichasNota(data: AppData, nota: NotaPedido): AppData {
  const notaBase =
    isDivisaoEntregaHabilitada() ? nota : { ...nota, divisaoEntrega: undefined as DivisaoEntregaNota | undefined };
  const without = data.fichaCorrida.filter((f) => f.notaPedidoId !== notaBase.id);
  const responsavel = notaBase.conferidaPor ?? "Cooperativa";
  const participantes = notaBase.divisaoEntrega?.participantes ?? [];

  if (participantes.length > 1) {
    const divisao = notaBase.divisaoEntrega!;
    const totalFotos = inferirQtdPartesFichaNota(data.fichaCorrida, notaBase);
    let novasFichas: FichaCorrida[];
    if (totalFotos > 1) {
      novasFichas = [];
      for (let fotoIdx = 0; fotoIdx < totalFotos; fotoIdx++) {
        novasFichas.push(
          ...buildFichasDivisaoFromNota(data, notaBase, responsavel, divisao, [...without, ...novasFichas], {
            fotoIndex: fotoIdx,
            totalFotos,
          })
        );
      }
    } else {
      novasFichas = buildFichasDivisaoFromNota(data, notaBase, responsavel, divisao, without);
    }
    let fichaCorrida = recalcularSaldosFichaNota([...without, ...novasFichas], notaBase);

    let arquivosMensais = data.arquivosMensais;
    for (const p of participantes) {
      arquivosMensais = upsertArquivoMensal(
        { ...data, fichaCorrida, arquivosMensais },
        p.cooperadoId,
        notaBase.cooperativaId,
        notaBase.mesReferencia,
        { notaPedidoIds: [notaBase.id] }
      );
    }

    return { ...data, fichaCorrida, arquivosMensais };
  }

  const qtdPartes = inferirQtdPartesFichaNota(data.fichaCorrida, notaBase);
  let novasFichas: FichaCorrida[];
  if (qtdPartes > 1) {
    novasFichas = buildFichasMultiFotoFromNota(data, notaBase, responsavel, without, qtdPartes);
  } else {
    const ctx = { ...data, fichaCorrida: without };
    const ficha = buildFichaFromNota(notaBase, ctx, responsavel, notaBase.cooperadoNomeSnapshot);
    ficha.status = statusFichaAposConferenciaNota(data, notaBase, notaBase.cooperadoId);
    novasFichas = [ficha];
  }

  const fichaCorrida = recalcularSaldosFichaNota([...without, ...novasFichas], notaBase);
  const arquivosMensais = upsertArquivoMensal(
    { ...data, fichaCorrida: without },
    notaBase.cooperadoId,
    notaBase.cooperativaId,
    notaBase.mesReferencia,
    { notaPedidoIds: [notaBase.id] }
  );
  return { ...data, fichaCorrida, arquivosMensais };
}

export function dividirEntregaEntreCooperados(
  data: AppData,
  notaPedidoId: string,
  outrosCooperadoIds: string[],
  cooperativaId: string
): AppData {
  if (!isDivisaoEntregaHabilitada()) return data;
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
      const key =
        item.produtoInstituicaoId ||
        `${(item.produtoNome ?? "").trim()}::${(item.unidade ?? "").trim()}`;
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
  return [...map.values()].sort((a, b) =>
    (a.produtoNome ?? "").localeCompare(b.produtoNome ?? "", "pt-BR")
  );
}

export type SincronizarTotaisNotaComFichasOpts = {
  forcarDescontoLiquido?: boolean;
  sincronizarBruto?: boolean;
  sincronizarItens?: boolean;
  /**
   * Lançamento/conferência atual: fichas pré-existentes da mesma nota não podem
   * rebaixar bruto/líquido (nem substituir itens) do valor recém-calculado.
   */
  preservarTotaisDoLancamentoAtual?: boolean;
};

/** Ajusta totais da nota para bater com a soma das fichas (multi-entrega). */
export function sincronizarTotaisNotaComFichas(
  nota: NotaPedido,
  fichas: FichaCorrida[],
  opts?: SincronizarTotaisNotaComFichasOpts
): NotaPedido {
  const list = fichas.filter((f) => f.notaPedidoId === nota.id);
  if (!list.length) return nota;
  const tot = somaTotaisFichasNota(fichas, nota.id);
  if (opts?.preservarTotaisDoLancamentoAtual) {
    const rebaixaLiquido = tot.valorLiquido + 0.01 < nota.valorLiquido;
    const rebaixaBruto = tot.valorBruto + 0.01 < nota.valorBruto;
    if (rebaixaLiquido || rebaixaBruto) return nota;
  }
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
  if (fichasValoresAlinhadosComNota(fichas, nota)) return fichas;
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
          valorBruto: nota.valorBruto,
          descontos: nota.valorDesconto,
          valorLiquido: nota.valorLiquido,
          descontosDetalhe,
        }
      : entry
  );
}

/** Ajusta a última ficha da nota quando a soma difere só por centavos (multi-foto / divisão). */
export function alinharSomaFichasComNota(
  fichas: FichaCorrida[],
  nota: NotaPedido
): FichaCorrida[] {
  if (fichasValoresAlinhadosComNota(fichas, nota)) return fichas;
  const list = fichas.filter((f) => f.notaPedidoId === nota.id);
  if (!list.length) return fichas;

  const tot = somaTotaisFichasNota(fichas, nota.id);
  const dBruto = round2(nota.valorBruto - tot.valorBruto);
  const dLiq = round2(nota.valorLiquido - tot.valorLiquido);
  const dDesc = round2(nota.valorDesconto - tot.valorDesconto);
  const maxDrift = list.length > 1 ? 0.15 : 0.05;
  if (Math.abs(dBruto) > maxDrift || Math.abs(dLiq) > maxDrift || Math.abs(dDesc) > maxDrift) {
    return fichas;
  }

  const target = list[list.length - 1];
  const newDesc = round2((target.descontos ?? 0) + dDesc);
  return fichas.map((f) =>
    f.id === target.id
      ? {
          ...f,
          valorBruto: round2((f.valorBruto ?? 0) + dBruto),
          descontos: newDesc,
          valorLiquido: round2((f.valorLiquido ?? 0) + dLiq),
          descontosDetalhe:
            newDesc > 0
              ? [
                  {
                    tipo: "cooperativa" as const,
                    motivo: `Taxa cooperativa (${nota.percentualDescontoCooperativa}%)`,
                    valor: newDesc,
                  },
                ]
              : [],
        }
      : f
  );
}

function inferirQtdPartesFichaNota(fichas: FichaCorrida[], nota: NotaPedido): number {
  const existing = fichas.filter((f) => f.notaPedidoId === nota.id);
  let maxTotal = 0;
  let hasFotoPart = false;
  for (const f of existing) {
    const m = f.descricao.match(/\(foto\s+(\d+)\s*\/\s*(\d+)\)/i);
    if (m) {
      hasFotoPart = true;
      maxTotal = Math.max(maxTotal, parseInt(m[2], 10));
    }
  }
  if (hasFotoPart && maxTotal > 1) return maxTotal;
  if (existing.length > 0 && !hasFotoPart) return 1;
  const fromNota = contarFotosEnviadasNota(nota);
  if (fromNota > 1) return fromNota;
  return 1;
}

/** Divisão N-way: cobertura, soma das fichas e fatia esperada por participante. */
export function fichasDivisaoEntregaConsistentes(
  data: AppData,
  fichaCorrida: FichaCorrida[],
  nota: NotaPedido
): boolean {
  const participantes = nota.divisaoEntrega?.participantes ?? [];
  if (participantes.length <= 1) return true;

  const fichas = dedupeFichaCorridaPorNota(
    fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
    data.notasPedido
  );
  if (!divisaoFichasCobremParticipantes(data, fichas, nota)) return false;
  if (!fichasValoresAlinhadosComNota(fichas, nota)) return false;

  const N = participantes.length;
  for (let i = 0; i < N; i++) {
    const p = participantes[i];
    const esperado = dividirValorEntrega(nota.valorLiquido, i, N);
    const canonP = resolverCooperadoIdCanonico(data, p.cooperadoId, nota.cooperativaId);
    const soma = round2(
      fichas
        .filter(
          (f) =>
            resolverCooperadoIdCanonico(data, f.cooperadoId, nota.cooperativaId) === canonP
        )
        .reduce((s, f) => s + f.valorLiquido, 0)
    );
    if (Math.abs(soma - esperado) >= 0.02) return false;
  }
  return true;
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

  const notaById = new Map((notas ?? []).map((n) => [n.id, n]));
  const out: FichaCorrida[] = [];
  for (const [notaId, list] of byNota) {
    const notaRef = notaById.get(notaId);
    const divN = notaRef?.divisaoEntrega?.participantes.length ?? 0;
    const coopIds = new Set(list.map((f) => f.cooperadoId));
    const multiCoopNaNota = coopIds.size > 1;
    const parts = list.map((f) => {
      let part = chaveParteFichaCorrida(f);
      if (multiCoopNaNota && divN <= 1 && !part.startsWith("div:")) {
        const m = f.descricao.match(/\(foto\s+(\d+)\s*\/\s*(\d+)\)/i);
        if (m) part = `div:${f.cooperadoId}:foto:${m[1]}/${m[2]}`;
        else part = `div:${f.cooperadoId}:full`;
      }
      return { f, part };
    });
    const hasFotoParts = parts.some((p) => p.part.startsWith("foto:"));
    const best = new Map<string, FichaCorrida>();

    for (const { f, part } of parts) {
      if (hasFotoParts && part === "full") continue;
      const cur = best.get(part);
      if (!cur) {
        best.set(part, f);
        continue;
      }
      let target = notaValor.get(notaId);
      if (notaRef && divN > 1 && part.startsWith("div:")) {
        const coopPart = part.split(":")[1];
        const idx = notaRef.divisaoEntrega!.participantes.findIndex((p) => p.cooperadoId === coopPart);
        if (idx >= 0) target = dividirValorEntrega(notaRef.valorLiquido, idx, divN);
      }
      const curMatch = target != null && Math.abs(cur.valorLiquido - target) < 0.01;
      const newMatch = target != null && Math.abs(f.valorLiquido - target) < 0.01;
      if (newMatch && !curMatch) {
        best.set(part, f);
        continue;
      }
      if (curMatch && !newMatch) continue;
      if (f.status === "pago" && cur.status !== "pago") {
        best.set(part, f);
        continue;
      }
      if (cur.status === "pago" && f.status !== "pago") continue;
      const score = (x: FichaCorrida) =>
        (x.id.startsWith("fc_np_") ? 2 : 0) + (x.status === "pago" ? 4 : 0);
      const sNew = score(f);
      const sCur = score(cur);
      if (sNew > sCur) {
        best.set(part, f);
        continue;
      }
      if (sNew < sCur) continue;
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
  if (nota.status === "rejeitada" || nota.status === "rascunho") return false;
  if (nota.status === "conferida" || nota.status === "pago") {
    return !notaQuitadaPorPagamentoCooperativaRegistrado(data, nota, ficha.cooperadoId);
  }
  return false;
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

/** Fichas para calcular PIX — inclui ficha paga fantasma (sem pagamentosCooperado) até reparar/sync. */
function listarFichasBaseCalculoPagamento(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): FichaCorrida[] {
  const pendentes = listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, cooperativaId);
  if (pendentes.length) return pendentes;

  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const notaById = new Map((data.notasPedido ?? []).map((n) => [n.id, n]));
  const fichaPagoSemRegistro = (f: FichaCorrida) => {
    const nota = notaById.get(f.notaPedidoId);
    if (nota?.status === "pago") return false;
    return true;
  };
  const temFantasma = data.fichaCorrida.some(
    (f) =>
      fichaPertenceCooperado(data, f, canonico, coopId) &&
      f.mesReferencia === mesReferencia &&
      f.status === "pago" &&
      fichaPagoSemRegistro(f) &&
      !mesComPagamentoCooperativaRegistrado(data, cooperadoId, mesReferencia)
  );
  if (!temFantasma) return pendentes;

  const candidatas = data.fichaCorrida.filter(
    (f) =>
      fichaPertenceCooperado(data, f, canonico, coopId) &&
      f.mesReferencia === mesReferencia &&
      f.status === "pago" &&
      fichaPagoSemRegistro(f) &&
      fichaValidaNoExtrato(data, f)
  );
  return dedupeFichaCorridaPorNota(candidatas, data.notasPedido);
}

/** Cria lançamentos na ficha a partir de notas já conferidas (sincronizadas da nuvem). */
function mesComPagamentoCooperativaRegistrado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): boolean {
  if (getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia)) return true;
  return !!getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia);
}

/** Nota já incluída em PIX/registro — não recriar ficha pendente após conferência posterior. */
function notaReferenciaTemporalEscopoPagamento(nota: NotaPedido): number {
  const stamps = [nota.dataConferencia, nota.updatedAt, nota.createdAt]
    .map((s) => Date.parse(s ?? ""))
    .filter((t) => Number.isFinite(t));
  return stamps.length ? Math.max(...stamps) : Number.NaN;
}

function notaQuitadaPorPagamentoCooperativaRegistrado(
  data: AppData,
  nota: NotaPedido,
  cooperadoId?: string
): boolean {
  const alvo = cooperadoId ?? nota.cooperadoId;
  const coopId =
    nota.cooperativaId ?? data.cooperados.find((c) => c.id === alvo)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, alvo, coopId);

  for (const p of data.pagamentosCooperado ?? []) {
    if (p.status !== "aguardando_confirmacao" && p.status !== "confirmado") continue;
    const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, p.cooperativaId);
    if (pCanon !== canonico) continue;
    if (coopId && p.cooperativaId && p.cooperativaId !== coopId) continue;

    if (p.notaPedidoIds?.includes(nota.id)) return true;

    const meses = getMesesReferenciaPagamento(p);
    if (!meses.includes(nota.mesReferencia)) continue;

    const escopoExplicito = (p.fichaIds?.length ?? 0) > 0 || (p.notaPedidoIds?.length ?? 0) > 0;
    if (escopoExplicito) {
      const fichaIdsPagamento = new Set(p.fichaIds ?? []);
      if (
        (data.fichaCorrida ?? []).some(
          (f) => fichaIdsPagamento.has(f.id) && f.notaPedidoId === nota.id
        )
      ) {
        return true;
      }
      continue;
    }

    const notaTs = notaReferenciaTemporalEscopoPagamento(nota);
    const pagoTs = Date.parse(p.pagoEm ?? p.createdAt ?? "");
    if (!Number.isNaN(notaTs) && !Number.isNaN(pagoTs) && notaTs <= pagoTs) return true;
  }

  return false;
}

/** Meses com débito aberto na ficha (mesma base do total a pagar do responsável). */
export function listarMesesDebitoAbertoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  return mesesReferenciaComDebitoAberto(data, cooperadoId, cooperativaId);
}

function statusFichaAposConferenciaNota(
  data: AppData,
  nota: NotaPedido,
  cooperadoId: string
): FichaCorrida["status"] {
  if (notaQuitadaPorPagamentoCooperativaRegistrado(data, nota, cooperadoId)) {
    return "pago";
  }
  /** Nota quitada na operação — não manter “a receber” fantasma (ex.: Cleber vs Ivan na mesma divisão). */
  if (nota.status === "pago") {
    return "pago";
  }
  return "pendente";
}

/** Entrega dividida: titular pago ≠ participante pago — corrige ficha paga fantasma após sync. */
function alinharStatusFichaComNotasConferidas(
  data: AppData,
  fichaCorrida: FichaCorrida[]
): { fichaCorrida: FichaCorrida[]; changed: boolean } {
  const notaById = new Map((data.notasPedido ?? []).map((n) => [n.id, n]));
  const now = new Date().toISOString();
  let changed = false;
  const next = fichaCorrida.map((f) => {
    const nota = notaById.get(f.notaPedidoId);
    if (!nota || (nota.status !== "conferida" && nota.status !== "pago")) return f;
    const esperado = statusFichaAposConferenciaNota(data, nota, f.cooperadoId);
    if (f.status === esperado) return f;
    changed = true;
    return { ...f, status: esperado, updatedAt: now };
  });
  return { fichaCorrida: next, changed };
}

/** Pagamento com recibo assinado — valores congelados no registro (não recalcular HB/sync). */
export function getPagamentoConfirmadoCooperadoMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): PagamentoCooperadoRegistro | undefined {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  return data.pagamentosCooperado.find(
    (p) =>
      (p.cooperadoId === cooperadoId ||
        p.cooperadoId === canonico ||
        resolverCooperadoIdCanonico(data, p.cooperadoId, p.cooperativaId ?? coopId) === canonico) &&
      pagamentoCobreMesReferencia(p, mesReferencia) &&
      p.status === "confirmado"
  );
}

export function reconciliarFichaFromNotasConferidas(data: AppData): AppData {
  const dataNorm = normalizarIntegridadeNotasLancadas(data);
  const dedupedInitial = dedupeFichaCorridaPorNota(dataNorm.fichaCorrida, dataNorm.notasPedido);
  let fichaCorrida = dedupedInitial;
  let changed =
    dedupedInitial.length !== dataNorm.fichaCorrida.length ||
    dataNorm.notasPedido !== data.notasPedido;
  const fichaNotaIds = new Set(fichaCorrida.map((f) => f.notaPedidoId));
  let arquivosMensais = dataNorm.arquivosMensais;
  let notasPedido = dataNorm.notasPedido ?? [];

  const notasOrdenadas = [...notasPedido].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (let nota of notasOrdenadas) {
    if (nota.status !== "conferida" && nota.status !== "pago") continue;
    if (nota.valorLiquido <= 0 && (nota.itens ?? []).every((i) => i.quantidade <= 0)) continue;

    const fichasDestaNota = fichaCorrida.filter((f) => f.notaPedidoId === nota.id);

    if (!isDivisaoEntregaHabilitada()) {
      const tinhaMetaDivisao = (nota.divisaoEntrega?.participantes.length ?? 0) > 1;
      const cooperadosNaFicha = new Set(
        fichasDestaNota.map((f) =>
          resolverCooperadoIdCanonico(data, f.cooperadoId, nota.cooperativaId)
        )
      );
      const fichasDivididas = cooperadosNaFicha.size > 1;
      if (tinhaMetaDivisao || fichasDivididas) {
        nota = { ...nota, divisaoEntrega: undefined, updatedAt: new Date().toISOString() };
        notasPedido = notasPedido.map((n) => (n.id === nota.id ? nota : n));
        const ctxData = { ...data, fichaCorrida, arquivosMensais, notasPedido };
        const rebuilt = rebuildFichasNota(ctxData, nota);
        fichaCorrida = rebuilt.fichaCorrida;
        arquivosMensais = rebuilt.arquivosMensais;
        const fichasNota = dedupeFichaCorridaPorNota(
          fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
          notasPedido
        );
        const notaSync = sincronizarTotaisNotaComFichas(nota, fichasNota, {
          forcarDescontoLiquido: true,
          sincronizarBruto: true,
        });
        notasPedido = notasPedido.map((n) => (n.id === nota.id ? notaSync : n));
        fichaNotaIds.add(nota.id);
        changed = true;
        continue;
      }
    }

    const divisaoInferida = inferirDivisaoEntregaDasFichas(data, nota, fichasDestaNota);
    if (divisaoInferida && (nota.divisaoEntrega?.participantes.length ?? 0) <= 1) {
      nota = { ...nota, divisaoEntrega: divisaoInferida, updatedAt: new Date().toISOString() };
      notasPedido = notasPedido.map((n) => (n.id === nota.id ? nota : n));
      changed = true;
    }
    const qtdParticipantes = nota.divisaoEntrega?.participantes.length ?? 1;

    if (isDivisaoEntregaHabilitada() && nota.divisaoEntrega && qtdParticipantes > 1) {
      const ctxData = { ...data, fichaCorrida, arquivosMensais, notasPedido };
      if (fichasDivisaoEntregaConsistentes(ctxData, fichaCorrida, nota)) {
        continue;
      }
      const rebuilt = rebuildFichasNota(ctxData, nota);
      fichaCorrida = rebuilt.fichaCorrida;
      arquivosMensais = rebuilt.arquivosMensais;
      const fichasNota = dedupeFichaCorridaPorNota(
        fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
        notasPedido
      );
      const notaSync = sincronizarTotaisNotaComFichas(nota, fichasNota, {
        forcarDescontoLiquido: true,
        sincronizarBruto: true,
      });
      notasPedido = notasPedido.map((n) => (n.id === nota.id ? notaSync : n));
      fichaNotaIds.add(nota.id);
      changed = true;
      continue;
    }

    const quitadaRegistrada = notaQuitadaPorPagamentoCooperativaRegistrado(data, nota, nota.cooperadoId);
    if (quitadaRegistrada && fichasDestaNota.length > 0) continue;

    const fichasExistentes = fichasDestaNota;

    if (fichasExistentes.length > 0) {
      if (fichasValoresAlinhadosComNota(fichaCorrida, nota)) continue;
      let ajustadas = alinharFichaUnicaComNota(fichaCorrida, nota);
      ajustadas = alinharSomaFichasComNota(ajustadas, nota);
      if (fichasValoresAlinhadosComNota(ajustadas, nota)) {
        fichaCorrida = ajustadas;
        changed = true;
        continue;
      }
      fichaCorrida = ajustadas;
      const ctx = { ...data, fichaCorrida, arquivosMensais };
      const rebuilt = rebuildFichasNota(ctx, nota);
      fichaCorrida = rebuilt.fichaCorrida;
      arquivosMensais = rebuilt.arquivosMensais;
      fichaNotaIds.add(nota.id);
      changed = true;
      continue;
    }

    if (fichaNotaIds.has(nota.id)) continue;

    const ctx = { ...data, fichaCorrida, arquivosMensais, notasPedido };
    const rebuilt = rebuildFichasNota(ctx, nota);
    fichaCorrida = rebuilt.fichaCorrida;
    arquivosMensais = rebuilt.arquivosMensais;
    fichaNotaIds.add(nota.id);
    changed = true;
  }

  const dedupedFinal = dedupeFichaCorridaPorNota(fichaCorrida, data.notasPedido);
  if (dedupedFinal.length !== fichaCorrida.length) {
    fichaCorrida = dedupedFinal;
    changed = true;
  }

  const alinhado = alinharStatusFichaComNotasConferidas({ ...data, fichaCorrida, arquivosMensais }, fichaCorrida);
  fichaCorrida = alinhado.fichaCorrida;
  if (alinhado.changed) changed = true;

  const merged = { ...dataNorm, fichaCorrida, arquivosMensais, notasPedido };
  return purgarFichasInvalidas(merged);
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
  const meses = mesesReferenciaComDebitoAberto(data, cooperadoId, coopId);
  return round2(
    meses.reduce(
      (s, mes) => s + getResumoValorAPagarRelatorio(data, cooperadoId, mes, coopId).valorLiquido,
      0
    )
  );
}

/** Meses com ficha/pagamento pendente — sem chamar getResumoValorAPagar (evita recursão). */
export function mesesReferenciaComDebitoAberto(
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
    if (pagamentoAguardandoSupersedidoPorConfirmado(data, cooperadoId, p)) continue;
    for (const mes of getMesesReferenciaPagamento(p)) {
      meses.add(mes);
    }
  }

  for (const f of data.fichaCorrida) {
    if (
      fichaPertenceCooperado(data, f, canonico, coopId) &&
      f.status === "pago" &&
      !mesComPagamentoCooperativaRegistrado(data, f.cooperadoId, f.mesReferencia)
    ) {
      meses.add(f.mesReferencia);
    }
  }

  for (const mes of mesesComValoresAvulsos(data, cooperadoId, coopId)) {
    if (valoresAvulsosPendentesMes(data, cooperadoId, mes, coopId).length > 0) {
      meses.add(mes);
    }
  }

  return [...meses].sort();
}

/** Fichas pendentes de entregas conferidas depois do PIX já registrado (nota fora do escopo do pagamento). */
export function fichasPendentesComplementaresPosPagamento(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): FichaCorrida[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const confirmado = getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia);
  if (!confirmado) return [];
  const notaIds = new Set(confirmado.notaPedidoIds ?? []);
  const fichaIds = new Set(confirmado.fichaIds ?? []);
  if (notaIds.size === 0 && fichaIds.size === 0) return [];
  return listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId).filter(
    (f) => !notaIds.has(f.notaPedidoId) && !fichaIds.has(f.id)
  );
}

/** Entregas conferidas fora do escopo do PIX aguardando assinatura (ex.: setembro após pagamento só de agosto). */
export function fichasPendentesComplementaresPosPagamentoAguardando(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): FichaCorrida[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const aguardando = getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia);
  if (!aguardando) return [];
  const escopoExplicito =
    (aguardando.fichaIds?.length ?? 0) > 0 || (aguardando.notaPedidoIds?.length ?? 0) > 0;
  if (!escopoExplicito) return [];
  return listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId).filter(
    (f) => !fichaDentroEscopoPagamentoCooperado(data, aguardando, f)
  );
}

function getResumoSomenteFichasComplementares(fichas: FichaCorrida[]): {
  valorBruto: number;
  descontoCooperativa: number;
  descontosExtras: FichaCorridaDesconto[];
  valorEntregas: number;
  valorLiquido: number;
  fichaIds: string[];
  notaPedidoIds: string[];
} {
  const valorBruto = round2(fichas.reduce((s, f) => s + f.valorBruto, 0));
  const descontoCooperativa = round2(fichas.reduce((s, f) => s + f.descontos, 0));
  const valorEntregas = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
  return {
    valorBruto,
    descontoCooperativa,
    descontosExtras: [],
    valorEntregas,
    valorLiquido: valorEntregas,
    fichaIds: fichas.map((f) => f.id),
    notaPedidoIds: fichas.map((f) => f.notaPedidoId),
  };
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
  const fichas = listarFichasBaseCalculoPagamento(data, cooperadoId, mesReferencia, coopId);
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
      motivo: textoDescontoMensalidadeFicha(mesReferencia, mensalidadeFixa),
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
    if (avulso.natureza === "debito") {
      descontosExtras.push({
        tipo: "manual",
        motivo: avulso.motivo.trim() || "Débito avulso",
        valor: avulso.valor,
      });
    } else {
      descontosExtras.push({
        tipo: "credito_avulso",
        motivo: avulso.motivo.trim() || "Valor avulso a receber",
        valor: avulso.valor,
      });
    }
  }
  for (const line of descontosContaCoopLinhasExibicao(coopMes)) {
    descontosExtras.push(line);
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

/** Valor líquido para relatórios e pagamento — inclui abatimento HB Créditos (mesma base da ficha). */
export function getResumoValorAPagarRelatorio(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoPagamentoCooperado {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const aguardando = getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia);
  if (aguardando) {
    const complementares = fichasPendentesComplementaresPosPagamentoAguardando(
      data,
      cooperadoId,
      mesReferencia,
      coopId
    );
    if (complementares.length > 0) {
      const pendentes = listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId);
      if (complementares.length === pendentes.length) {
        const base = getResumoSomenteFichasComplementares(complementares);
        return getResumoPagamentoParaRegistro(base, data, cooperadoId, mesReferencia, coopId);
      }
    }
    return { ...resumoFromPagamento(aguardando), valorLiquido: 0 };
  }
  const confirmado = getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia);
  const pendentes = listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId);
  if (confirmado && pendentes.length === 0) {
    return { ...resumoFromPagamento(confirmado), valorLiquido: 0 };
  }
  if (confirmado && pendentes.length > 0) {
    const complementares = fichasPendentesComplementaresPosPagamento(
      data,
      cooperadoId,
      mesReferencia,
      coopId
    );
    if (complementares.length > 0 && complementares.length === pendentes.length) {
      const base = getResumoSomenteFichasComplementares(complementares);
      return getResumoPagamentoParaRegistro(base, data, cooperadoId, mesReferencia, coopId);
    }
  }
  const live = getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, coopId);
  return getResumoPagamentoParaRegistro(live, data, cooperadoId, mesReferencia, coopId);
}

export function resumoComplementaresPosPagamento(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoPagamentoCooperado | null {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const complementares = fichasPendentesComplementaresPosPagamento(
    data,
    cooperadoId,
    mesReferencia,
    coopId
  );
  if (!complementares.length) return null;
  const pendentes = listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId);
  if (complementares.length !== pendentes.length) return null;
  const base = getResumoSomenteFichasComplementares(complementares);
  return getResumoPagamentoParaRegistro(base, data, cooperadoId, mesReferencia, coopId);
}

/** Valor exibido ao cooperado — entregas; menos uso HB Créditos no mercado quando houver compras no mês. */
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
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const arquivo = getArquivoMensalCooperado(data, canonico, mesReferencia, coopId);
  const fromArquivo = descontosContaCoopFromArquivo(arquivo);
  if (!coopId) return fromArquivo;
  const fromMemoria = getContaCoopDescontosMemoria(coopId, canonico, mesReferencia);
  return resolveDescontosContaCoopMesParaCalculo(
    fromArquivo,
    fromMemoria,
    hasContaCoopDescontosMemoria(coopId, canonico, mesReferencia),
    contaCoopDescontosMesFetchAutoritativo(coopId, canonico, mesReferencia)
  );
}

/** Compras HB após o responsável registrar o pagamento — abate o que o cooperado ainda “vê” até assinar. */
export function netHbAbatePosRegistroPagamento(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  pagoEm: string,
  cooperativaId?: string
): number {
  const descontos = getDescontosContaCoopMesCached(data, cooperadoId, mesReferencia, cooperativaId);
  const pagoTs = new Date(pagoEm).getTime();
  if (!Number.isFinite(pagoTs)) return 0;
  let compras = 0;
  let estornos = 0;
  for (const d of descontos) {
    const ts = new Date(d.createdAt).getTime();
    if (!Number.isFinite(ts) || ts < pagoTs) continue;
    const isRefund = d.motivo.toLowerCase().includes("estorno");
    if (isRefund) estornos += d.valorReais;
    else compras += d.valorReais;
  }
  return round2(Math.max(0, compras - estornos));
}

function aplicarDescontosContaCoopMesNoResumo(
  resumo: ResumoPagamentoCooperado,
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ResumoPagamentoCooperado {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const mesesPendentes = mesesReferenciaComDebitoAberto(data, canonico, coopId);
  const descontos = filtrarDescontosContaCoopParaMesReferencia(
    getDescontosContaCoopMesCached(data, canonico, mesReferencia, coopId),
    mesReferencia,
    mesesPendentes
  );
  if (!descontos.length) return resumo;
  return mergeDescontosContaCoopNoResumo(resumo, descontos);
}

/** Resumo com abatimento HB Créditos quando houver compras no mercado no mês. */
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
  const coopId =
    opts.cooperativaId ?? opts.data.cooperados.find((c) => c.id === opts.cooperadoId)?.cooperativaId;
  const baseMes = getResumoPagamentoCooperado(opts.data, opts.cooperadoId, opts.mesReferencia, coopId);
  return getResumoPagamentoParaRegistro(
    baseMes,
    opts.data,
    opts.cooperadoId,
    opts.mesReferencia,
    coopId
  ).valorLiquido;
}

/** Linhas do resumo alinhadas ao valor a receber (inclui compras HB Créditos). */
export function getDescontosExtrasExibicaoCooperado(
  resumo: ResumoPagamentoCooperado,
  opts?: ValorExibicaoCooperadoOpts
): FichaCorridaDesconto[] {
  if (!opts) return resumo.descontosExtras;
  const coopId =
    opts.cooperativaId ?? opts.data.cooperados.find((c) => c.id === opts.cooperadoId)?.cooperativaId;
  const baseMes = getResumoPagamentoCooperado(opts.data, opts.cooperadoId, opts.mesReferencia, coopId);
  const comHb = getResumoPagamentoParaRegistro(
    baseMes,
    opts.data,
    opts.cooperadoId,
    opts.mesReferencia,
    coopId
  );
  if (comHb.descontosExtras.some((d) => d.tipo === "conta_coop")) {
    return comHb.descontosExtras;
  }
  if (resumo.descontosExtras.some((d) => d.tipo === "conta_coop")) {
    return resumo.descontosExtras;
  }
  return comHb.descontosExtras;
}

/** Registro de pagamento pelo responsável — inclui abatimento HB Créditos (mercado). */
export function getResumoPagamentoParaRegistro(
  resumo: ResumoPagamentoCooperado,
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string,
  opts?: { omitirDescontosContaCoop?: boolean }
): ResumoPagamentoCooperado {
  if (opts?.omitirDescontosContaCoop) return resumo;
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
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const confirmado = getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia);
  const pendentes = listarFichasPendentesPagamento(data, cooperadoId, mesReferencia, coopId);
  if (confirmado && pendentes.length === 0) {
    return resumoFromPagamento(confirmado);
  }
  if (confirmado && pendentes.length > 0) {
    const complementar = resumoComplementaresPosPagamento(data, cooperadoId, mesReferencia, coopId);
    if (complementar) return complementar;
  }
  const pagamento = getPagamentoAguardandoCooperado(data, cooperadoId, mesReferencia);
  if (pagamento) {
    const snap = resumoFromPagamento(pagamento);
    const live = getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, coopId, ajustes);
    if (live.valorEntregas <= 0) {
      const fichasSnap = snap.fichaIds
        .map((id) => data.fichaCorrida.find((f) => f.id === id))
        .filter((f): f is FichaCorrida => f != null);
      if (fichasSnap.some((f) => f.status === "pago")) {
        return snap;
      }
      if (fichasSnap.some((f) => f.status === "pendente")) {
        const base: ResumoPagamentoCooperado = {
          ...snap,
          descontosExtras: snap.descontosExtras.filter(
            (d) =>
              d.tipo !== "conta_coop" &&
              !(d.tipo === "credito_avulso" && d.motivo.toLowerCase().includes("estorno"))
          ),
        };
        return getResumoPagamentoParaRegistro(base, data, cooperadoId, mesReferencia, coopId);
      }
      return snap;
    }
    const base: ResumoPagamentoCooperado = {
      ...snap,
      valorBruto: live.valorBruto,
      descontoCooperativa: live.descontoCooperativa,
      valorEntregas: live.valorEntregas,
      fichaIds: live.fichaIds,
      notaPedidoIds: live.notaPedidoIds,
      descontosExtras: snap.descontosExtras.filter(
        (d) =>
          d.tipo !== "conta_coop" &&
          !(d.tipo === "credito_avulso" && d.motivo.toLowerCase().includes("estorno"))
      ),
    };
    return getResumoPagamentoParaRegistro(base, data, cooperadoId, mesReferencia, coopId);
  }
  const live = getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, coopId, ajustes);
  return getResumoPagamentoParaRegistro(live, data, cooperadoId, mesReferencia, coopId);
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
  if (getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia)) {
    return data;
  }
  const deduped = dedupeDescontosContaCoopRemotos(descontos);
  const hbSyncedAt = new Date().toISOString();
  return {
    ...data,
    arquivosMensais: upsertArquivoMensal(data, cooperadoId, cooperativaId, mesReferencia, {
      contaCoopDescontosUpdatedAt: hbSyncedAt,
      contaCoopDescontos: deduped.map((d) => ({
        motivo: d.motivo,
        valorReais: d.valorReais,
        tipo: d.motivo.toLowerCase().includes("estorno") ? ("credito_avulso" as const) : ("conta_coop" as const),
        createdAt: d.createdAt,
        ...(d.hbTransactionId ? { hbTransactionId: d.hbTransactionId } : {}),
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
    return getResumoPagamentoExibicao(
      data,
      cooperadoId,
      meses[0],
      cooperativaId,
      ajustesPorMes?.[meses[0]]
    );
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
    const r = getResumoPagamentoExibicao(data, cooperadoId, mes, coopId, ajustesPorMes?.[mes]);
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

/** Pagamento já registrado pelo responsável (PIX feito), mesmo aguardando assinatura do recibo. */
export function pagamentoRegistradoParaRelatorio(p: PagamentoCooperadoRegistro): boolean {
  return p.status === "confirmado" || p.status === "aguardando_confirmacao";
}

export function somaValorPagamentosRegistrados(pagamentos: PagamentoCooperadoRegistro[]): number {
  return round2(
    pagamentos.filter(pagamentoRegistradoParaRelatorio).reduce((s, p) => s + p.valorLiquido, 0)
  );
}

/**
 * Cooperado — antes de exibir “aguardando assinatura”, compara com pagamento confirmado no mesmo mês.
 * Evita recibo/valor fantasma quando merge deixou `aguardando_confirmacao` stale ao lado de `confirmado`.
 */
function pagamentoAguardandoSupersedidoPorConfirmado(
  data: AppData,
  cooperadoId: string,
  aguardando: PagamentoCooperadoRegistro
): boolean {
  const meses = getMesesReferenciaPagamento(aguardando);
  if (!meses.length) return false;
  return meses.every((mes) => !!getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mes));
}

function notaCobertaPorPagamentoCooperadoEspecifico(
  data: AppData,
  pagamento: PagamentoCooperadoRegistro,
  nota: NotaPedido
): boolean {
  if (pagamento.notaPedidoIds?.includes(nota.id)) return true;

  const meses = getMesesReferenciaPagamento(pagamento);
  if (!meses.includes(nota.mesReferencia)) return false;

  const escopoExplicito =
    (pagamento.fichaIds?.length ?? 0) > 0 || (pagamento.notaPedidoIds?.length ?? 0) > 0;
  if (!escopoExplicito) return false;

  const fichaIdsPagamento = new Set(pagamento.fichaIds ?? []);
  if (
    (data.fichaCorrida ?? []).some(
      (f) => fichaIdsPagamento.has(f.id) && f.notaPedidoId === nota.id
    )
  ) {
    return true;
  }
  return false;
}

function fichaDentroEscopoPagamentoCooperado(
  data: AppData,
  pagamento: PagamentoCooperadoRegistro,
  ficha: FichaCorrida
): boolean {
  if (pagamento.fichaIds?.includes(ficha.id)) return true;
  const nota = data.notasPedido.find((n) => n.id === ficha.notaPedidoId);
  if (!nota) return false;
  return notaCobertaPorPagamentoCooperadoEspecifico(data, pagamento, nota);
}

function pagamentoAguardandoTemEscopoEstruturalSuficiente(
  pagamento: PagamentoCooperadoRegistro
): boolean {
  return (pagamento.fichaIds?.length ?? 0) > 0 || (pagamento.notaPedidoIds?.length ?? 0) > 0;
}

function fichasReferenciadasDoPagamentoTodasPagasNoMes(
  data: AppData,
  pagamento: PagamentoCooperadoRegistro,
  cooperadoId: string,
  mes: string,
  canonico: string,
  coopId?: string
): boolean {
  const refFichaIds = new Set(pagamento.fichaIds ?? []);
  const refNotaIds = new Set(pagamento.notaPedidoIds ?? []);
  const fichasMes = data.fichaCorrida.filter(
    (f) =>
      fichaPertenceCooperado(data, f, canonico, coopId) && f.mesReferencia === mes
  );

  if (refFichaIds.size > 0) {
    const fichasReferenciadas = fichasMes.filter((f) => refFichaIds.has(f.id));
    if (!fichasReferenciadas.length) return false;
    return fichasReferenciadas.every((f) => f.status === "pago");
  }

  if (refNotaIds.size > 0) {
    let checouAlguma = false;
    for (const notaId of refNotaIds) {
      const nota = data.notasPedido.find((n) => n.id === notaId);
      if (!nota || nota.mesReferencia !== mes) continue;
      checouAlguma = true;
      const fichasNota = fichasMes.filter((f) => f.notaPedidoId === notaId);
      if (fichasNota.length) {
        if (!fichasNota.every((f) => f.status === "pago")) return false;
      } else if (nota.status !== "pago") {
        return false;
      }
    }
    return checouAlguma;
  }

  return false;
}

/**
 * Aguardando obsoleto para recibo: escopo do pagamento quitado na ficha e nova entrega
 * elegível fora desse escopo (mesma lógica de cobertura que notaQuitada…, por pagamento p).
 */
function pagamentoAguardandoObsoletoPorNovaEntregaForaDoEscopo(
  data: AppData,
  cooperadoId: string,
  pagamento: PagamentoCooperadoRegistro
): boolean {
  if (!pagamentoAguardandoTemEscopoEstruturalSuficiente(pagamento)) return false;

  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const refFichaIds = new Set(pagamento.fichaIds ?? []);
  const refNotaIds = new Set(pagamento.notaPedidoIds ?? []);

  for (const mes of getMesesReferenciaPagamento(pagamento)) {
    if (
      !fichasReferenciadasDoPagamentoTodasPagasNoMes(
        data,
        pagamento,
        cooperadoId,
        mes,
        canonico,
        coopId ?? undefined
      )
    ) {
      continue;
    }

    const fichasMes = data.fichaCorrida.filter(
      (f) =>
        fichaPertenceCooperado(data, f, canonico, coopId ?? undefined) &&
        f.mesReferencia === mes
    );

    for (const f of fichasMes) {
      if (refFichaIds.has(f.id)) continue;
      if (!fichaNotaElegivelParaPagamento(data, f)) continue;
      const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
      if (!nota) continue;
      if (refNotaIds.has(nota.id)) continue;
      if (notaCobertaPorPagamentoCooperadoEspecifico(data, pagamento, nota)) continue;
      return true;
    }
  }
  return false;
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
      (!mesReferencia || pagamentoCobreMesReferencia(p, mesReferencia)) &&
      !pagamentoAguardandoSupersedidoPorConfirmado(data, cooperadoId, p) &&
      !pagamentoAguardandoObsoletoPorNovaEntregaForaDoEscopo(data, cooperadoId, p)
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

/** ID de catálogo usável para agrupar fotos; vazio/null não identifica produto. */
function produtoInstituicaoIdParaConsolidarFoto(
  id: NotaPedidoItem["produtoInstituicaoId"] | null | undefined
): string | null {
  if (id == null) return null;
  const trimmed = String(id).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Chave só da consolidação multi-foto (não persistida).
 * ID válido → agrupa entre fotos; sem ID → ocorrência (foto + índice) isolada.
 */
function chaveConsolidacaoItemPorFoto(
  item: NotaPedidoItem,
  fotoIndex: number,
  itemIndex: number
): string {
  const id = produtoInstituicaoIdParaConsolidarFoto(item.produtoInstituicaoId);
  if (id) return `id:${id}`;
  return `occ:${fotoIndex}:${itemIndex}`;
}

/** Soma itens lançados em várias fotos da mesma entrega. */
export function consolidarItensLancamentoPorFoto(
  lancamentos: NotaPedidoItem[][]
): NotaPedidoItem[] {
  const map = new Map<string, NotaPedidoItem>();
  for (let fotoIndex = 0; fotoIndex < lancamentos.length; fotoIndex++) {
    const lista = lancamentos[fotoIndex] ?? [];
    for (let itemIndex = 0; itemIndex < lista.length; itemIndex++) {
      const item = lista[itemIndex];
      if (item.quantidade <= 0) continue;
      const key = chaveConsolidacaoItemPorFoto(item, fotoIndex, itemIndex);
      const prev = map.get(key);
      if (prev) {
        map.set(key, {
          ...prev,
          quantidade: round2(prev.quantidade + item.quantidade),
          valorBruto: round2(prev.valorBruto + item.valorBruto),
        });
      } else {
        map.set(key, { ...item });
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
  for (const mes of mesesPagamento) {
    if (
      getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mes) ||
      getPagamentoAguardandoCooperado(data, cooperadoId, mes)
    ) {
      return data;
    }
  }
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
    status: "confirmado",
    pagoPor: responsavel,
    pagoEm: now,
    createdAt: now,
    updatedAt: now,
  };

  const escopoMarcacao =
    (resumo.fichaIds?.length ?? 0) > 0 || (resumo.notaPedidoIds?.length ?? 0) > 0
      ? { fichaIds: resumo.fichaIds, notaPedidoIds: resumo.notaPedidoIds }
      : undefined;

  let next = data;
  for (const mes of mesesPagamento) {
    next = marcarFichaComoPaga(next, cooperadoCanonico, mes, responsavel, escopoMarcacao);
    next = marcarValoresAvulsosPagosMes(next, cooperadoCanonico, mes, coopIdResolved);
  }

  next = {
    ...next,
    pagamentosCooperado: [...next.pagamentosCooperado, pagamento],
  };

  for (const mes of mesesPagamento) {
    next = {
      ...next,
      arquivosMensais: upsertArquivoMensal(next, cooperadoCanonico, coopIdResolved, mes, {
        notaPedidoIds: resumo.notaPedidoIds,
      }),
    };
  }

  next = lancarPagamentoCooperadoNoCaixa(next, pagamento);
  return finalizarPagamentoCooperadoConfirmado(next, pagamento.id);
}

const TITULO_COMUNICADO_PAGAMENTO = "pagamento realizado";

/** Pagamento confirmado pelo responsável (recibo na hora; assinatura do cooperado opcional). */
export function finalizarPagamentoCooperadoConfirmado(
  data: AppData,
  pagamentoId: string,
  opts?: { assinaturaDataUrl?: string }
): AppData {
  const pagamento = data.pagamentosCooperado.find((p) => p.id === pagamentoId);
  if (!pagamento) return data;
  if (pagamento.status !== "aguardando_confirmacao" && pagamento.status !== "confirmado") {
    return data;
  }
  if (pagamento.status === "confirmado" && pagamento.reciboHtml?.trim()) {
    return data;
  }

  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  if (!cooperado) return data;

  const now = new Date().toISOString();
  const assinatura = opts?.assinaturaDataUrl?.trim();
  const draft: PagamentoCooperadoRegistro = {
    ...pagamento,
    status: "confirmado",
    updatedAt: now,
    ...(assinatura
      ? { assinaturaCooperado: assinatura, assinadoEm: now }
      : { assinaturaCooperado: pagamento.assinaturaCooperado, assinadoEm: pagamento.assinadoEm }),
  };
  const itensMes =
    pagamento.fichaIds.length > 0
      ? agregarItensFromFichaIds(data, pagamento.fichaIds)
      : agregarItensFichaMeses(
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
    p.id === pagamentoId ? { ...draft, reciboHtml } : p
  );

  let next: AppData = {
    ...data,
    pagamentosCooperado,
  };

  const escopoMarcacao =
    (pagamento.fichaIds?.length ?? 0) > 0 || (pagamento.notaPedidoIds?.length ?? 0) > 0
      ? { fichaIds: pagamento.fichaIds, notaPedidoIds: pagamento.notaPedidoIds }
      : undefined;

  for (const mes of getMesesReferenciaPagamento(pagamento)) {
    next = marcarFichaComoPaga(
      next,
      pagamento.cooperadoId,
      mes,
      pagamento.pagoPor ?? "Cooperativa",
      escopoMarcacao
    );
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
        c.titulo.trim().toLowerCase() === TITULO_COMUNICADO_PAGAMENTO;
      if (paraCooperado && avisoPagamento && c.cooperativaId === coopId) {
        return { ...c, ativo: false };
      }
      return c;
    }),
  };

  return next;
}

/** Legado: pagamentos antigos aguardando assinatura passam a confirmados (sem ação do cooperado). */
export function promoverPagamentosAguardandoConfirmadosPeloResponsavel(data: AppData): AppData {
  let next = data;
  for (const p of data.pagamentosCooperado) {
    if (p.status !== "aguardando_confirmacao") continue;
    next = finalizarPagamentoCooperadoConfirmado(next, p.id);
  }
  return next;
}

export function confirmarPagamentoCooperado(
  data: AppData,
  pagamentoId: string,
  assinaturaDataUrl: string
): AppData {
  return finalizarPagamentoCooperadoConfirmado(data, pagamentoId, {
    assinaturaDataUrl,
  });
}

function comunicadoAvisoPagamentoCooperado(
  c: { cooperativaId?: string; cooperadoId?: string; categoria?: string; titulo: string },
  coopId: string,
  cooperadoId: string,
  cooperadoCanonico: string
): boolean {
  if (!c.cooperativaId || c.cooperativaId !== coopId) return false;
  const paraCooperado =
    !c.cooperadoId || c.cooperadoId === cooperadoId || c.cooperadoId === cooperadoCanonico;
  return (
    paraCooperado &&
    c.categoria === "financeiro" &&
    c.titulo.trim().toLowerCase() === TITULO_COMUNICADO_PAGAMENTO
  );
}

/** Reabre o fluxo de assinatura do recibo (cooperado vê de novo no início do app). */
export function reenviarSolicitacaoAssinaturaRecibo(
  data: AppData,
  pagamentoId: string,
  responsavel: string
): AppData {
  const pagamento = data.pagamentosCooperado.find((p) => p.id === pagamentoId);
  if (!pagamento || pagamento.status !== "aguardando_confirmacao") return data;

  const now = new Date().toISOString();
  const mesLabel = formatMesesReferenciaRotulo(getMesesReferenciaPagamento(pagamento));
  const cooperadoCanonico = resolverCooperadoIdCanonico(
    data,
    pagamento.cooperadoId,
    pagamento.cooperativaId
  );
  const valorTxt = pagamento.valorLiquido.toFixed(2).replace(".", ",");
  const descricao = `A cooperativa registrou o pagamento de ${valorTxt} referente a ${mesLabel}. Abra Financeiro, confirme o recebimento e assine o recibo.`;

  const pagamentosCooperado = data.pagamentosCooperado.map((p) =>
    p.id === pagamentoId
      ? {
          ...p,
          assinaturaCooperado: undefined,
          assinadoEm: undefined,
          reciboHtml: undefined,
          updatedAt: now,
        }
      : p
  );

  let reativouComunicado = false;
  let comunicados = data.comunicados.map((c) => {
    if (!comunicadoAvisoPagamentoCooperado(c, pagamento.cooperativaId, pagamento.cooperadoId, cooperadoCanonico)) {
      return c;
    }
    reativouComunicado = true;
    return {
      ...c,
      ativo: true,
      fixado: true,
      descricao,
      data: now.split("T")[0],
      responsavel,
    };
  });

  if (!reativouComunicado) {
    comunicados = [
      ...comunicados,
      {
        id: `cm_${Date.now()}`,
        cooperativaId: pagamento.cooperativaId,
        cooperadoId: cooperadoCanonico,
        titulo: "Pagamento realizado",
        descricao,
        data: now.split("T")[0],
        responsavel,
        categoria: "financeiro" as const,
        fixado: true,
        visivelParaTodos: false,
        ativo: true,
        createdAt: now,
      },
    ];
  }

  return { ...data, pagamentosCooperado, comunicados };
}

/** Responsável marca recibo assinado como conferido. */
export function marcarReciboPagamentoVerificadoResponsavel(
  data: AppData,
  pagamentoId: string,
  responsavelId: string,
  responsavelNome: string
): AppData {
  const pagamento = data.pagamentosCooperado.find((p) => p.id === pagamentoId);
  if (!pagamento || pagamento.status !== "confirmado" || !pagamento.assinaturaCooperado?.trim()) {
    return data;
  }
  if (pagamento.reciboConferidoPorResponsavelEm) return data;

  const now = new Date().toISOString();
  return {
    ...data,
    pagamentosCooperado: data.pagamentosCooperado.map((p) =>
      p.id === pagamentoId
        ? {
            ...p,
            reciboConferidoPorResponsavelEm: now,
            reciboConferidoPorId: responsavelId,
            reciboConferidoPorNome: responsavelNome,
            updatedAt: now,
          }
        : p
    ),
  };
}

export type MarcarFichaComoPagaEscopo = {
  fichaIds?: string[];
  notaPedidoIds?: string[];
};

/** Marca fichas pagas no AppData local — escopo explícito alinhado ao operacional (H8.9.178). */
export function marcarFichaComoPaga(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  _responsavel: string,
  escopo?: MarcarFichaComoPagaEscopo
): AppData {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const now = new Date().toISOString();
  const fichaIdsPagamento = new Set(escopo?.fichaIds ?? []);
  const notaIdsPagamento = new Set(escopo?.notaPedidoIds ?? []);
  const escopoExplicito = fichaIdsPagamento.size > 0 || notaIdsPagamento.size > 0;

  const pertenceCooperadoMes = (f: FichaCorrida): boolean =>
    fichaPertenceCooperado(data, f, cooperadoId, coopId) && f.mesReferencia === mesReferencia;

  let fichaAtualizada = data.fichaCorrida.map((f) => {
    if (!pertenceCooperadoMes(f) || f.status !== "pendente") return f;

    if (escopoExplicito) {
      const porFichaId = fichaIdsPagamento.has(f.id);
      const porNotaId = notaIdsPagamento.has(f.notaPedidoId);
      if (!porFichaId && !porNotaId) return f;
    }

    return { ...f, status: "pago" as const, updatedAt: now };
  });

  if (escopoExplicito) {
    const notaIdsComPago = new Set<string>();
    for (const f of fichaAtualizada) {
      if (f.status !== "pago" || !pertenceCooperadoMes(f)) continue;
      if (fichaIdsPagamento.has(f.id) || notaIdsPagamento.has(f.notaPedidoId)) {
        notaIdsComPago.add(f.notaPedidoId);
      }
    }
    if (notaIdsComPago.size) {
      fichaAtualizada = fichaAtualizada.filter((f) => {
        if (f.status !== "pendente" || !pertenceCooperadoMes(f)) return true;
        return !notaIdsComPago.has(f.notaPedidoId);
      });
    }
  }

  const notaIds = fichaAtualizada
    .filter((f) => pertenceCooperadoMes(f) && f.status === "pago")
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

/** Pagamento ativo (aguardando ou confirmado) que cobre a entrega — mesma regra do recibo/valor a receber. */
function entregaReferenciadaEmPagamentoCooperativoAtivo(
  data: AppData,
  nota: NotaPedido,
  cooperativaId: string
): boolean {
  for (const p of data.pagamentosCooperado) {
    if (p.cooperativaId !== cooperativaId) continue;
    if (p.status !== "aguardando_confirmacao" && p.status !== "confirmado") continue;
    if (notaCobertaPorPagamentoCooperadoEspecifico(data, p, nota)) return true;
  }
  return false;
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

  if (entregaReferenciadaEmPagamentoCooperativoAtivo(data, nota, cooperativaId)) {
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

/** Cooperado: entrega apagada na nuvem / tombstone da cooperativa — remove da lista local. */
export function aplicarExclusaoRemotaNotaPedido(
  data: AppData,
  notaId: string,
  cooperativaId: string
): AppData {
  if (isNotaPedidoExcluida(data, notaId, cooperativaId)) {
    return aplicarNotasPedidoExcluidas(data, cooperativaId);
  }
  const notasPedido = data.notasPedido.filter((n) => n.id !== notaId);
  const withTombstone = registrarNotaPedidoExcluida(
    notasPedido.length === data.notasPedido.length ? data : { ...data, notasPedido },
    notaId,
    cooperativaId
  );
  return aplicarNotasPedidoExcluidas(withTombstone, cooperativaId);
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

function notaTemLancamentoVisivelCorrecao(data: AppData, nota: NotaPedido): boolean {
  if (nota.status === "conferida" || nota.status === "rejeitada" || nota.status === "aguardando_conferencia") {
    return true;
  }
  return data.fichaCorrida.some(
    (f) => f.notaPedidoId === nota.id && f.status === "pendente" && f.valorLiquido > 0
  );
}

/** Valor exibido na lista de correções (nota ou ficha pendente vinculada). */
export function valorLiquidoEntregaCorrecaoExibicao(data: AppData, nota: NotaPedido): number {
  if (nota.valorLiquido > 0) return nota.valorLiquido;
  let total = 0;
  for (const f of data.fichaCorrida) {
    if (f.notaPedidoId !== nota.id || f.status !== "pendente") continue;
    total += Math.max(0, Number(f.valorLiquido) || 0);
  }
  return Math.round(total * 100) / 100;
}

export type StatusCorrecaoEntregaCooperado = {
  visivel: boolean;
  executavel: boolean;
  reason?: MotivoBloqueioExclusaoEntrega;
};

/** Lista Correções — inclui entregas bloqueadas (ex.: em pagamento) para bater com valor na ficha do cooperado. */
export function statusCorrecaoEntregaCooperado(
  data: AppData,
  notaId: string,
  cooperativaId: string,
  acao: "apagar" | "relancar"
): StatusCorrecaoEntregaCooperado {
  const nota = data.notasPedido.find((n) => n.id === notaId);
  if (!nota) return { visivel: false, executavel: false, reason: "not_found" };
  if (nota.cooperativaId !== cooperativaId) return { visivel: false, executavel: false, reason: "wrong_coop" };
  if (nota.status === "pago") return { visivel: false, executavel: false, reason: "pago" };

  if (acao === "relancar") {
    if (nota.status !== "conferida" && nota.status !== "rejeitada") {
      return { visivel: false, executavel: false, reason: "not_found" };
    }
    const rel = podeRelancarEntregaNota(data, notaId, cooperativaId);
    if (rel.ok) return { visivel: true, executavel: true };
    return { visivel: true, executavel: false, reason: rel.reason };
  }

  const ex = podeExcluirEntregaNota(data, notaId, cooperativaId);
  if (ex.ok) return { visivel: true, executavel: true };
  const visivel =
    notaTemLancamentoVisivelCorrecao(data, nota) &&
    (ex.reason === "em_pagamento" || ex.reason === "ficha_paga");
  return { visivel, executavel: false, reason: ex.reason };
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
      return statusCorrecaoEntregaCooperado(data, n.id, cooperativaId, acao).visivel;
    })
    .sort((a, b) => new Date(b.dataEntrega).getTime() - new Date(a.dataEntrega).getTime());
}

/** Cooperados com ao menos uma entrega elegível para apagar ou re-lançar (aba Correções). */
export function listarCooperadosEntregasCorrecao(
  data: AppData,
  cooperativaId: string,
  acao: "apagar" | "relancar"
): { id: string; nomeCompleto: string }[] {
  const ids = new Set<string>();
  for (const n of data.notasPedido) {
    if (n.cooperativaId !== cooperativaId) continue;
    const donoId = resolverCooperadoIdCanonico(data, n.cooperadoId, cooperativaId, n.cooperadoNomeSnapshot);
    const candidatos = new Set<string>([donoId]);
    for (const p of n.divisaoEntrega?.participantes ?? []) {
      candidatos.add(resolverCooperadoIdCanonico(data, p.cooperadoId, cooperativaId));
    }
    for (const cid of candidatos) {
      if (!notaEnvolveCooperadoCorrecao(data, n, cid, cooperativaId)) continue;
      if (!statusCorrecaoEntregaCooperado(data, n.id, cooperativaId, acao).visivel) continue;
      ids.add(cid);
    }
  }
  return [...ids]
    .map((id) => ({
      id,
      nomeCompleto: getCooperadoNomeResolvido(data, id, cooperativaId),
    }))
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
}
