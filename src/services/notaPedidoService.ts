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
} from "@/types";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  listCooperadosDaCooperativa,
  resolverCooperadoIdCanonico,
  getCooperadoNomeResolvido,
} from "@/services/cooperadoCloudService";
import { descontosDoCooperadoNoMes } from "@/services/descontosService";
import { valoresAvulsosPendentesMes, marcarValoresAvulsosPagosMes } from "@/services/valoresAvulsosReceberService";
import { round2 } from "@/utils/calculations";
import { gerarReciboHtml, resumoReciboFromPagamento } from "@/utils/recibo";
import { lancarPagamentoCooperadoNoCaixa } from "@/services/livroCaixaService";

export interface ItemResumoFichaMes {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
  valorBruto: number;
}

/** Soma itens de todas as entregas do cooperado no mês (ficha corrida consolidada). */
export function agregarItensFichaMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): { itens: ItemResumoFichaMes[]; entregas: number; valorBruto: number } {
  const fichas = listarFichasExtratoCooperadoMes(data, cooperadoId, mesReferencia, cooperativaId);

  const map = new Map<string, ItemResumoFichaMes>();
  for (const ficha of fichas) {
    for (const item of ficha.itens ?? []) {
      if (item.quantidade <= 0) continue;
      const key = item.produtoInstituicaoId;
      const existente = map.get(key);
      if (existente) {
        existente.quantidade = round2(existente.quantidade + item.quantidade);
        existente.valorBruto = round2(existente.valorBruto + item.valorBruto);
      } else {
        map.set(key, {
          produtoInstituicaoId: item.produtoInstituicaoId,
          produtoNome: item.produtoNome,
          unidade: item.unidade,
          precoUnitario: item.precoUnitario,
          quantidade: item.quantidade,
          valorBruto: item.valorBruto,
        });
      }
    }
  }

  const itens = [...map.values()].sort((a, b) =>
    a.produtoNome.localeCompare(b.produtoNome, "pt-BR")
  );
  const valorBruto = round2(itens.reduce((s, i) => s + i.valorBruto, 0));

  return { itens, entregas: fichas.length, valorBruto };
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
      const key = item.produtoInstituicaoId;
      const existente = map.get(key);
      if (existente) {
        existente.quantidade = round2(existente.quantidade + item.quantidade);
        existente.valorBruto = round2(existente.valorBruto + item.valorBruto);
      } else {
        map.set(key, { ...item });
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
  const valorDesconto = round2(valorBruto * (percentualDesconto / 100));
  const valorLiquido = round2(valorBruto - valorDesconto);

  return { itens: calculados, valorBruto, valorDesconto, valorLiquido };
}

export function gerarNumeroNota(data: AppData, cooperativaId: string): string {
  const count = data.notasPedido.filter((n) => n.cooperativaId === cooperativaId).length + 1;
  const ano = new Date().getFullYear();
  return `${ano}-${String(count).padStart(4, "0")}`;
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
      "notaPedidoIds" | "pagamentoIds" | "mensalidadeFixa" | "descontoAvulso" | "descontoAvulsoMotivo" | "cotaIngressoPaga"
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
    const valorBruto = dividirValorEntrega(nota.valorBruto, i, N);
    const descontos = dividirValorEntrega(nota.valorDesconto, i, N);
    const valorLiquido = dividirValorEntrega(nota.valorLiquido, i, N);
    const saldoAnterior =
      opts?.fotoIndex != null
        ? getSaldoAnteriorFicha(ctx, p.cooperadoId, nota.mesReferencia)
        : getSaldoAnteriorFicha(ctx, p.cooperadoId, nota.mesReferencia, nota.id);
    const ficha: FichaCorrida = {
      ...base,
      valorBruto,
      descontos,
      valorLiquido,
      itens: dividirItensEntrega(nota.itens ?? [], i, N),
      descontosDetalhe: base.descontosDetalhe?.map((d) => ({
        ...d,
        valor: dividirValorEntrega(d.valor, i, N),
      })),
      saldoAcumulado: round2(saldoAnterior + valorLiquido),
      divisaoEntrega: divisao,
    };
    if (nota.status === "pago") ficha.status = "pago";
    novasFichas.push(ficha);
  }

  return novasFichas;
}

/** Recria fichas da nota (1 ou N cooperados conforme divisaoEntrega). */
export function rebuildFichasNota(data: AppData, nota: NotaPedido): AppData {
  const without = data.fichaCorrida.filter((f) => f.notaPedidoId !== nota.id);
  const responsavel = nota.conferidaPor ?? "Cooperativa";
  const participantes = nota.divisaoEntrega?.participantes ?? [];

  if (participantes.length <= 1) {
    const ctx = { ...data, fichaCorrida: without };
    const ficha = buildFichaFromNota(nota, ctx, responsavel, nota.cooperadoNomeSnapshot);
    if (nota.status === "pago") ficha.status = "pago";
    const fichaCorrida = [...without, ficha];
    const arquivosMensais = upsertArquivoMensal(ctx, nota.cooperadoId, nota.cooperativaId, nota.mesReferencia, {
      notaPedidoIds: [nota.id],
    });
    return { ...data, fichaCorrida, arquivosMensais };
  }

  const divisao = nota.divisaoEntrega!;
  const novasFichas = buildFichasDivisaoFromNota(data, nota, responsavel, divisao, without);
  const fichaCorrida = [...without, ...novasFichas];

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
  if (!nota) return false;
  if (nota.status !== "conferida" && nota.status !== "pago") return false;
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
  const removidas = data.fichaCorrida.filter((f) => !fichaValidaNoExtrato(data, f));
  if (removidas.length === 0) return data;

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
    fichaNotaElegivelParaPagamento(data, f)
  );
}

/** Cria lançamentos na ficha a partir de notas já conferidas (sincronizadas da nuvem). */
export function reconciliarFichaFromNotasConferidas(data: AppData): AppData {
  data = purgarFichasInvalidas(data);
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
      if (divisaoFichasCobremParticipantes({ ...data, fichaCorrida }, fichasExistentes, nota)) {
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

    if (fichaNotaIds.has(nota.id) || fichasExistentes.length > 0) continue;

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

  if (!changed) return data;
  return { ...data, fichaCorrida, arquivosMensais };
}

export function getTotalAPagarCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (mesReferencia) {
    return getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, coopId).valorLiquido;
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
    meses.reduce((s, mes) => s + getResumoPagamentoCooperado(data, cooperadoId, mes, coopId).valorLiquido, 0)
  );
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
      (!mesReferencia || p.mesReferencia === mesReferencia)
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
  responsavel: string
): AppData {
  const coopId = data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const resumo = getResumoPagamentoCooperado(data, cooperadoCanonico, mesReferencia, coopId);
  if (resumo.valorLiquido <= 0 || resumo.fichaIds.length === 0) return data;

  const now = new Date().toISOString();
  const cooperado = data.cooperados.find((c) => c.id === cooperadoCanonico);
  const coopIdResolved = cooperado?.cooperativaId ?? coopId ?? "";

  const pagamento: PagamentoCooperadoRegistro = {
    id: `pg_${Date.now()}`,
    cooperativaId: coopIdResolved,
    cooperadoId: cooperadoCanonico,
    mesReferencia,
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

  let next = marcarFichaComoPaga(data, cooperadoCanonico, mesReferencia, responsavel);
  next = marcarValoresAvulsosPagosMes(next, cooperadoCanonico, mesReferencia, coopIdResolved);

  const comunicado: Comunicado = {
    id: `cm_${Date.now()}`,
    cooperativaId: coopIdResolved,
    cooperadoId: cooperadoCanonico,
    titulo: "Pagamento realizado",
    descricao: `A cooperativa registrou o pagamento de ${resumo.valorLiquido.toFixed(2).replace(".", ",")} referente a ${mesReferencia}. Abra Quanto vou receber, confirme o recebimento e assine o recibo.`,
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
    arquivosMensais: upsertArquivoMensal(next, cooperadoCanonico, coopIdResolved, mesReferencia, {
      notaPedidoIds: resumo.notaPedidoIds,
    }),
  };

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
  const itensMes = agregarItensFichaMes(data, pagamento.cooperadoId, pagamento.mesReferencia, pagamento.cooperativaId);
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
    arquivosMensais: upsertArquivoMensal(data, pagamento.cooperadoId, pagamento.cooperativaId, pagamento.mesReferencia, {
      pagamentoIds: [pagamentoId],
    }),
  };

  next = marcarFichaComoPaga(next, pagamento.cooperadoId, pagamento.mesReferencia, pagamento.pagoPor ?? "Cooperativa");

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
    data: { ...data, notasPedido, fichaCorrida, arquivosMensais },
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
    updatedAt: new Date().toISOString(),
  };

  const notasPedido = data.notasPedido.map((n) => (n.id === notaId ? notaRelancada : n));

  return {
    ok: true,
    nota: notaRelancada,
    data: { ...data, notasPedido, fichaCorrida, arquivosMensais },
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
