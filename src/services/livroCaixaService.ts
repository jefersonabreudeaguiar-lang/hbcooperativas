import type {
  AppData,
  FichaCorridaDesconto,
  LivroCaixaControleAnual,
  LivroCaixaLancamento,
  LivroCaixaOrigem,
  LivroCaixaTipo,
  Mensalidade,
  PagamentoCooperadoRegistro,
  User,
} from "@/types";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import { round2 } from "@/utils/calculations";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

export interface ResumoLivroCaixa {
  saldo: number;
  saldoCaixaEfetivo: number;
  totalCreditos: number;
  totalDebitos: number;
  totalCreditosRetencao: number;
  lancamentos: LivroCaixaLancamento[];
}

export interface SequenciaEventoCtx {
  numeroSequencia: number;
  anoSequencia: number;
  grupoEventoId: string;
}

export const ORIGENS_RETENCAO_CONTABIL: LivroCaixaOrigem[] = [
  "taxa_cooperativa",
  "mensalidade_ficha",
  "desconto_ficha",
];

export function isOrigemRetencaoContabil(origem: LivroCaixaOrigem): boolean {
  return ORIGENS_RETENCAO_CONTABIL.includes(origem);
}

export function formatNumeroSequenciaExibicao(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(n);
}

export function parseNumeroSequenciaInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mesFromData(dataIso: string): string {
  return dataIso.slice(0, 7);
}

export function compareLancamentoSequencia(a: LivroCaixaLancamento, b: LivroCaixaLancamento): number {
  const aSeq = a.numeroSequencia ?? Number.MAX_SAFE_INTEGER;
  const bSeq = b.numeroSequencia ?? Number.MAX_SAFE_INTEGER;
  if (aSeq !== bSeq) return aSeq - bSeq;
  if (a.numeroSequencia != null && b.numeroSequencia != null && a.numeroSequencia === b.numeroSequencia) {
    if (a.tipo !== b.tipo) return a.tipo === "debito" ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  }
  return a.createdAt.localeCompare(b.createdAt);
}

export function getControleAnualLivroCaixa(data: AppData, cooperativaId: string): LivroCaixaControleAnual | undefined {
  return (data.livroCaixaControleAnual ?? []).find((c) => c.cooperativaId === cooperativaId);
}

export function ensureControleAnualLivroCaixa(data: AppData, cooperativaId: string): AppData {
  const existente = getControleAnualLivroCaixa(data, cooperativaId);
  if (existente) return data;
  const ano = new Date().getFullYear();
  const controle: LivroCaixaControleAnual = {
    cooperativaId,
    anoLivro: ano,
    proximoSequencia: 1,
    historicoEncerramentos: [],
    updatedAt: new Date().toISOString(),
  };
  return {
    ...data,
    livroCaixaControleAnual: [...(data.livroCaixaControleAnual ?? []), controle],
  };
}

function upsertControle(data: AppData, controle: LivroCaixaControleAnual): AppData {
  const list = [...(data.livroCaixaControleAnual ?? [])];
  const idx = list.findIndex((c) => c.cooperativaId === controle.cooperativaId);
  const next = { ...controle, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  return { ...data, livroCaixaControleAnual: list };
}

/** Próximo número de evento no ano-livro vigente. */
export function alocarSequenciaEvento(
  data: AppData,
  cooperativaId: string,
  dataLancIso: string
): { data: AppData; ctx: SequenciaEventoCtx } {
  let next = ensureControleAnualLivroCaixa(data, cooperativaId);
  const controle = getControleAnualLivroCaixa(next, cooperativaId)!;
  const anoLivro = controle.anoLivro;
  const numeroSequencia = controle.proximoSequencia;
  const grupoEventoId = `evt_lc_${cooperativaId}_${anoLivro}_${numeroSequencia}_${Date.now()}`;
  const atualizado: LivroCaixaControleAnual = {
    ...controle,
    proximoSequencia: numeroSequencia + 1,
  };
  next = upsertControle(next, atualizado);
  return {
    data: next,
    ctx: { numeroSequencia, anoSequencia: anoLivro, grupoEventoId },
  };
}

export function pagamentoIdFromOrigemId(origemId?: string): string | null {
  if (!origemId) return null;
  if (origemId.startsWith("pg_caixa_")) return origemId.slice("pg_caixa_".length);
  if (origemId.startsWith("pg_taxa_")) return origemId.slice("pg_taxa_".length);
  if (origemId.startsWith("pg_mensficha_")) {
    const rest = origemId.slice("pg_mensficha_".length);
    const detalhe = rest.match(/^(pg_\d+)_m\d+$/);
    return detalhe ? detalhe[1] : rest;
  }
  const desc = origemId.match(/^pg_desc_(pg_\d+)_\d+_/);
  if (desc) return desc[1];
  return null;
}

function mensalidadeFichaOrigemId(pagamentoId: string, index: number, total: number): string {
  if (total <= 1) return `pg_mensficha_${pagamentoId}`;
  return `pg_mensficha_${pagamentoId}_m${index}`;
}

function removerLancamentoSistemaPorOrigemId(data: AppData, origemId: string): AppData {
  const alvo = (data.livroCaixa ?? []).find((l) => l.origemId === origemId);
  if (!alvo) return data;
  return {
    ...data,
    livroCaixa: (data.livroCaixa ?? []).filter((l) => l.origemId !== origemId),
    livroCaixaExcluidos: [
      ...(data.livroCaixaExcluidos ?? []).filter((e) => e.id !== alvo.id),
      {
        id: alvo.id,
        cooperativaId: alvo.cooperativaId,
        excluidoEm: new Date().toISOString(),
      },
    ],
  };
}

function ctxFromPagamentoExistente(data: AppData, pagamentoId: string): SequenciaEventoCtx | undefined {
  const linhas = (data.livroCaixa ?? []).filter(
    (l) => pagamentoIdFromOrigemId(l.origemId) === pagamentoId && l.numeroSequencia != null
  );
  const ref = linhas[0];
  if (!ref?.numeroSequencia || ref.anoSequencia == null) return undefined;
  return {
    numeroSequencia: ref.numeroSequencia,
    anoSequencia: ref.anoSequencia,
    grupoEventoId: ref.grupoEventoId ?? `evt_pg_${pagamentoId}`,
  };
}

export function lancamentosLivroCaixa(data: AppData, cooperativaId: string, mesReferencia?: string): LivroCaixaLancamento[] {
  let items = (data.livroCaixa ?? []).filter((l) => l.cooperativaId === cooperativaId);
  if (mesReferencia) items = items.filter((l) => l.mesReferencia === mesReferencia);
  return items.sort(compareLancamentoSequencia);
}

export function lancamentosLivroCaixaPorData(
  data: AppData,
  cooperativaId: string,
  dataIso: string
): LivroCaixaLancamento[] {
  return lancamentosLivroCaixa(data, cooperativaId).filter((l) => l.data === dataIso);
}

export function findLancamentosPorSequencia(
  data: AppData,
  cooperativaId: string,
  numeroSequencia: number,
  anoSequencia?: number
): LivroCaixaLancamento[] {
  const controle = getControleAnualLivroCaixa(data, cooperativaId);
  const ano = anoSequencia ?? controle?.anoLivro ?? new Date().getFullYear();
  return (data.livroCaixa ?? [])
    .filter(
      (l) =>
        l.cooperativaId === cooperativaId &&
        l.numeroSequencia === numeroSequencia &&
        (l.anoSequencia == null || l.anoSequencia === ano)
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function resumoLivroCaixa(data: AppData, cooperativaId: string, mesReferencia?: string): ResumoLivroCaixa {
  const lancamentos = lancamentosLivroCaixa(data, cooperativaId, mesReferencia);
  let totalCreditos = 0;
  let totalDebitos = 0;
  let totalCreditosRetencao = 0;
  for (const l of lancamentos) {
    if (l.tipo === "credito") {
      totalCreditos += l.valor;
      if (isOrigemRetencaoContabil(l.origem)) totalCreditosRetencao += l.valor;
    } else {
      totalDebitos += l.valor;
    }
  }
  const saldo = totalCreditos - totalDebitos;
  return {
    saldo,
    saldoCaixaEfetivo: saldo - totalCreditosRetencao,
    totalCreditos,
    totalDebitos,
    totalCreditosRetencao,
    lancamentos,
  };
}

export function resumoLivroCaixaGeral(data: AppData, cooperativaId: string): ResumoLivroCaixa {
  return resumoLivroCaixa(data, cooperativaId);
}

function jaExistePorOrigem(data: AppData, origemId: string): boolean {
  return (data.livroCaixa ?? []).some((l) => l.origemId === origemId);
}

export function appendLivroCaixaLancamento(
  data: AppData,
  input: Omit<LivroCaixaLancamento, "id" | "createdAt" | "updatedAt"> & { id?: string },
  seqCtx?: SequenciaEventoCtx
): AppData {
  if (input.origemId && jaExistePorOrigem(data, input.origemId)) return data;

  let next = data;
  let ctx = seqCtx;
  if (!input.numeroSequencia && !ctx) {
    const aloc = alocarSequenciaEvento(next, input.cooperativaId, input.data);
    next = aloc.data;
    ctx = aloc.ctx;
  }

  const now = new Date().toISOString();
  const lancamento: LivroCaixaLancamento = {
    id: input.id ?? `lc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...input,
    numeroSequencia: input.numeroSequencia ?? ctx?.numeroSequencia,
    anoSequencia: input.anoSequencia ?? ctx?.anoSequencia,
    grupoEventoId: input.grupoEventoId ?? ctx?.grupoEventoId,
    mesReferencia: input.mesReferencia || mesFromData(input.data),
    createdAt: now,
    updatedAt: now,
  };
  return { ...next, livroCaixa: [...(next.livroCaixa ?? []), lancamento] };
}

/** Atribui sequência a lançamentos antigos (sem número), em ordem de criação. */
export function atribuirSequenciasAusentes(data: AppData, cooperativaId: string): AppData {
  let next = ensureControleAnualLivroCaixa(data, cooperativaId);
  const semSeq = (next.livroCaixa ?? [])
    .filter((l) => l.cooperativaId === cooperativaId && l.numeroSequencia == null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (semSeq.length === 0) return next;

  const grupos = new Map<string, LivroCaixaLancamento[]>();
  const soltos: LivroCaixaLancamento[] = [];

  for (const l of semSeq) {
    const pgId = pagamentoIdFromOrigemId(l.origemId);
    if (pgId) {
      const key = `pg_${pgId}`;
      const arr = grupos.get(key) ?? [];
      arr.push(l);
      grupos.set(key, arr);
    } else {
      soltos.push(l);
    }
  }

  const aplicarCtx = (ctx: SequenciaEventoCtx, ids: Set<string>) => {
    next = {
      ...next,
      livroCaixa: (next.livroCaixa ?? []).map((item) => {
        if (!ids.has(item.id) || item.numeroSequencia != null) return item;
        return {
          ...item,
          numeroSequencia: ctx.numeroSequencia,
          anoSequencia: ctx.anoSequencia,
          grupoEventoId: ctx.grupoEventoId,
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  };

  for (const linhas of grupos.values()) {
    const dataRef = linhas[0]?.data ?? new Date().toISOString().split("T")[0];
    const aloc = alocarSequenciaEvento(next, cooperativaId, dataRef);
    next = aloc.data;
    const pgId = pagamentoIdFromOrigemId(linhas[0]?.origemId);
    const ctx: SequenciaEventoCtx = {
      ...aloc.ctx,
      grupoEventoId: pgId ? `evt_pg_${pgId}` : aloc.ctx.grupoEventoId,
    };
    aplicarCtx(ctx, new Set(linhas.map((x) => x.id)));
  }

  for (const l of soltos) {
    if ((next.livroCaixa ?? []).find((x) => x.id === l.id)?.numeroSequencia != null) continue;
    const aloc = alocarSequenciaEvento(next, cooperativaId, l.data);
    next = aloc.data;
    aplicarCtx(aloc.ctx, new Set([l.id]));
  }

  return next;
}

export function criarLancamentoManual(
  data: AppData,
  cooperativaId: string,
  tipo: LivroCaixaTipo,
  valor: number,
  historico: string,
  opts?: { data?: string; origem?: LivroCaixaOrigem; categoria?: string; responsavel?: string }
): AppData {
  const dataLanc = opts?.data ?? new Date().toISOString().split("T")[0];
  const origem = opts?.origem ?? (tipo === "credito" ? "credito_avulso" : "debito_avulso");
  return appendLivroCaixaLancamento(data, {
    cooperativaId,
    data: dataLanc,
    mesReferencia: mesFromData(dataLanc),
    tipo,
    valor: Math.abs(valor),
    historico: historico.trim(),
    origem,
    categoria: opts?.categoria,
    responsavel: opts?.responsavel,
  });
}

function labelDescontoFicha(tipo: FichaCorridaDesconto["tipo"]): string {
  switch (tipo) {
    case "cota":
      return "Cota retida na ficha";
    case "conta_coop":
      return "HB Créditos retida na ficha";
    case "cooperativa":
      return "Desconto cooperativa na ficha";
    case "manual":
      return "Desconto retido na ficha";
    default:
      return "Desconto retido na ficha";
  }
}

export function lancarRetencoesPagamentoNoCaixa(
  data: AppData,
  pagamento: PagamentoCooperadoRegistro,
  seqCtx?: SequenciaEventoCtx
): AppData {
  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  const nome = cooperado?.nomeCompleto?.trim() || "Cooperado";
  const dataLanc = pagamento.pagoEm.split("T")[0];
  const ctx = seqCtx ?? ctxFromPagamentoExistente(data, pagamento.id);
  const base = {
    cooperativaId: pagamento.cooperativaId,
    data: dataLanc,
    mesReferencia: pagamento.mesReferencia,
    responsavel: pagamento.pagoPor,
  };

  let next = data;

  if (pagamento.descontoCooperativa > 0) {
    next = appendLivroCaixaLancamento(
      next,
      {
        ...base,
        tipo: "credito",
        valor: pagamento.descontoCooperativa,
        historico: `Taxa cooperativa (5%) · ${nome} · ${pagamento.mesReferencia}`,
        origem: "taxa_cooperativa",
        origemId: `pg_taxa_${pagamento.id}`,
      },
      ctx
    );
  }

  const mensalidades = (pagamento.descontosExtras ?? []).filter((d) => d.tipo === "mensalidade" && d.valor > 0);
  const legacyMensId = `pg_mensficha_${pagamento.id}`;
  let temLegacyAgregado = jaExistePorOrigem(next, legacyMensId);
  if (mensalidades.length > 1 && temLegacyAgregado) {
    next = removerLancamentoSistemaPorOrigemId(next, legacyMensId);
    temLegacyAgregado = false;
  }
  mensalidades.forEach((d, i) => {
    const origemId = mensalidadeFichaOrigemId(pagamento.id, i, mensalidades.length);
    if (jaExistePorOrigem(next, origemId)) return;
    if (mensalidades.length === 1 && temLegacyAgregado && origemId === legacyMensId) return;
    const rotulo = (d.motivo ?? "").trim() || pagamento.mesReferencia;
    next = appendLivroCaixaLancamento(
      next,
      {
        ...base,
        tipo: "credito",
        valor: round2(d.valor),
        historico: `Mensalidade retida na ficha · ${rotulo} · ${nome}`,
        origem: "mensalidade_ficha",
        origemId,
      },
      ctx
    );
  });

  const outrosDescontos = (pagamento.descontosExtras ?? []).filter(
    (d) =>
      d.tipo !== "mensalidade" &&
      d.tipo !== "credito_avulso" &&
      d.tipo !== "cooperativa" &&
      d.valor > 0 &&
      !/\(estornada\)/i.test(d.motivo ?? "")
  );
  outrosDescontos.forEach((d, i) => {
    next = appendLivroCaixaLancamento(
      next,
      {
        ...base,
        tipo: "credito",
        valor: d.valor,
        historico: `${labelDescontoFicha(d.tipo)} · ${d.motivo.trim() || pagamento.mesReferencia} · ${nome}`,
        origem: "desconto_ficha",
        origemId: `pg_desc_${pagamento.id}_${i}_${d.tipo}`,
      },
      ctx
    );
  });

  return next;
}

export function montarHistoricoPagamentoCooperadoCaixa(
  data: AppData,
  pagamento: PagamentoCooperadoRegistro
): string {
  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  const nome = cooperado?.nomeCompleto?.trim() || "Cooperado";
  const refs =
    pagamento.mesesReferencia?.length
      ? pagamento.mesesReferencia.map((m) => formatMesReferencia(m)).join(", ")
      : formatMesReferencia(pagamento.mesReferencia);
  const fichas = (data.fichaCorrida ?? []).filter((f) => pagamento.fichaIds.includes(f.id));
  const resumoEntrega =
    fichas.length === 1
      ? fichas[0].descricao?.trim()
      : fichas.length > 1
        ? `${fichas.length} entregas na ficha`
        : "";
  const detalhe = resumoEntrega ? ` · ${resumoEntrega}` : "";
  return `Pagamento merenda · ref. ${refs} · ${nome}${detalhe}`;
}

export function lancarPagamentoCooperadoNoCaixa(data: AppData, pagamento: PagamentoCooperadoRegistro): AppData {
  const dataLanc = pagamento.pagoEm.split("T")[0];
  const existenteCtx = ctxFromPagamentoExistente(data, pagamento.id);
  let next = data;
  let ctx = existenteCtx;

  if (!jaExistePorOrigem(data, `pg_caixa_${pagamento.id}`)) {
    if (!ctx) {
      const aloc = alocarSequenciaEvento(next, pagamento.cooperativaId, dataLanc);
      next = aloc.data;
      ctx = { ...aloc.ctx, grupoEventoId: `evt_pg_${pagamento.id}` };
    }
    next = appendLivroCaixaLancamento(
      next,
      {
        cooperativaId: pagamento.cooperativaId,
        data: dataLanc,
        mesReferencia: pagamento.mesReferencia,
        tipo: "debito",
        valor: pagamento.valorLiquido,
        historico: montarHistoricoPagamentoCooperadoCaixa(next, pagamento),
        origem: "pagamento_cooperado",
        origemId: `pg_caixa_${pagamento.id}`,
        responsavel: pagamento.pagoPor,
        grupoEventoId: ctx?.grupoEventoId,
      },
      ctx
    );
  } else if (!ctx) {
    ctx = ctxFromPagamentoExistente(next, pagamento.id);
  }

  next = lancarRetencoesPagamentoNoCaixa(next, pagamento, ctx);
  return next;
}

export function lancarMensalidadeNoCaixa(data: AppData, mensalidade: Mensalidade): AppData {
  const cooperado = data.cooperados.find((c) => c.id === mensalidade.cooperadoId);
  return appendLivroCaixaLancamento(data, {
    cooperativaId: cooperado?.cooperativaId ?? "",
    data: mensalidade.dataPagamento ?? new Date().toISOString().split("T")[0],
    mesReferencia: mensalidade.mesReferencia,
    tipo: "credito",
    valor: mensalidade.valor,
    historico: `Mensalidade (PIX) ${cooperado?.nomeCompleto ?? ""} · ${mensalidade.mesReferencia}`,
    origem: "mensalidade",
    origemId: `mens_caixa_${mensalidade.id}`,
  });
}

export function lancarRepasseHbContaCoopNoCaixa(
  data: AppData,
  input: {
    cooperativaId: string;
    mesReferencia: string;
    valorReais: number;
    origemId: string;
    responsavel?: string;
    paidAt?: string;
  }
): AppData {
  const dataLanc = (input.paidAt ?? new Date().toISOString()).split("T")[0];
  const [ano, mesNum] = input.mesReferencia.split("-");
  const mesCurto = mesNum && ano ? `${mesNum.padStart(2, "0")}/${ano}` : input.mesReferencia;
  return appendLivroCaixaLancamento(data, {
    cooperativaId: input.cooperativaId,
    data: dataLanc,
    mesReferencia: input.mesReferencia,
    tipo: "debito",
    valor: round2(input.valorReais),
    historico: `Repasse HB · taxa HB Créditos ${CONTA_COOP_DESCONTO_SPLIT.appPercent}% · ${mesCurto}`,
    origem: "hb_app_repasse",
    origemId: input.origemId,
    categoria: "HB Créditos",
    responsavel: input.responsavel,
  });
}

export function completarLancamentosContabeisPagamentos(data: AppData, cooperativaId?: string): AppData {
  let next = data;
  const pagamentos = data.pagamentosCooperado.filter((p) => !cooperativaId || p.cooperativaId === cooperativaId);
  for (const pagamento of pagamentos) {
    if (pagamento.status !== "confirmado" && pagamento.status !== "aguardando_confirmacao") continue;
    next = lancarPagamentoCooperadoNoCaixa(next, pagamento);
  }
  return next;
}

export function completarMensalidadesPagasNoCaixa(data: AppData, cooperativaId?: string): AppData {
  let next = data;
  for (const mensalidade of data.mensalidades) {
    if (mensalidade.status !== "paga") continue;
    const cooperado = data.cooperados.find((c) => c.id === mensalidade.cooperadoId);
    const coopId = cooperado?.cooperativaId;
    if (!coopId) continue;
    if (cooperativaId && coopId !== cooperativaId) continue;
    const origemId = `mens_caixa_${mensalidade.id}`;
    if (jaExistePorOrigem(next, origemId)) continue;
    next = lancarMensalidadeNoCaixa(next, mensalidade);
  }
  return next;
}

/** Recompõe livro caixa a partir de pagamentos, mensalidades PIX e sequência anual. */
export function reconciliarLivroCaixaContabilCooperativa(data: AppData, cooperativaId: string): AppData {
  let next = ensureControleAnualLivroCaixa(data, cooperativaId);
  next = atribuirSequenciasAusentes(next, cooperativaId);
  next = completarLancamentosContabeisPagamentos(next, cooperativaId);
  next = completarMensalidadesPagasNoCaixa(next, cooperativaId);
  return next;
}

export type AuditoriaLivroCaixaContabil = {
  cooperativaId: string;
  pagamentosSemDebitoCaixa: string[];
  pagamentosSemTaxaCoopCaixa: string[];
  pagamentosSemMensalidadeFichaCaixa: string[];
  mensalidadesPagasSemCreditoCaixa: string[];
  totais: {
    debitosPagamentoEsperados: number;
    debitosPagamentoCaixa: number;
    creditosTaxaEsperados: number;
    creditosTaxaCaixa: number;
    creditosMensFichaEsperados: number;
    creditosMensFichaCaixa: number;
  };
};

export function auditarLivroCaixaContabilCooperativa(data: AppData, cooperativaId: string): AuditoriaLivroCaixaContabil {
  const pagamentos = data.pagamentosCooperado.filter(
    (p) =>
      p.cooperativaId === cooperativaId &&
      (p.status === "confirmado" || p.status === "aguardando_confirmacao")
  );
  const livro = (data.livroCaixa ?? []).filter((l) => l.cooperativaId === cooperativaId);
  const pagamentosSemDebitoCaixa: string[] = [];
  const pagamentosSemTaxaCoopCaixa: string[] = [];
  const pagamentosSemMensalidadeFichaCaixa: string[] = [];
  let debitosPagamentoEsperados = 0;
  let creditosTaxaEsperados = 0;
  let creditosMensFichaEsperados = 0;

  for (const p of pagamentos) {
    debitosPagamentoEsperados += p.valorLiquido;
    if (!livro.some((l) => l.origemId === `pg_caixa_${p.id}` && l.tipo === "debito")) {
      pagamentosSemDebitoCaixa.push(p.id);
    }
    if (p.descontoCooperativa > 0) {
      creditosTaxaEsperados += p.descontoCooperativa;
      if (!livro.some((l) => l.origemId === `pg_taxa_${p.id}` && l.tipo === "credito")) {
        pagamentosSemTaxaCoopCaixa.push(p.id);
      }
    }
    const mens = (p.descontosExtras ?? []).filter((d) => d.tipo === "mensalidade" && d.valor > 0);
    const totalMens = round2(mens.reduce((s, d) => s + d.valor, 0));
    if (totalMens > 0) {
      creditosMensFichaEsperados += totalMens;
      const temLinha =
        livro.some((l) => l.origemId === `pg_mensficha_${p.id}` && l.tipo === "credito") ||
        mens.some((_, i) =>
          livro.some((l) => l.origemId === mensalidadeFichaOrigemId(p.id, i, mens.length) && l.tipo === "credito")
        );
      if (!temLinha) pagamentosSemMensalidadeFichaCaixa.push(p.id);
    }
  }

  const mensalidadesPagasSemCreditoCaixa: string[] = [];
  for (const m of data.mensalidades) {
    if (m.status !== "paga") continue;
    const coop = data.cooperados.find((c) => c.id === m.cooperadoId);
    if (coop?.cooperativaId !== cooperativaId) continue;
    if (!livro.some((l) => l.origemId === `mens_caixa_${m.id}`)) {
      mensalidadesPagasSemCreditoCaixa.push(m.id);
    }
  }

  const debitosPagamentoCaixa = round2(
    livro.filter((l) => l.origem === "pagamento_cooperado" && l.tipo === "debito").reduce((s, l) => s + l.valor, 0)
  );
  const creditosTaxaCaixa = round2(
    livro.filter((l) => l.origem === "taxa_cooperativa" && l.tipo === "credito").reduce((s, l) => s + l.valor, 0)
  );
  const creditosMensFichaCaixa = round2(
    livro.filter((l) => l.origem === "mensalidade_ficha" && l.tipo === "credito").reduce((s, l) => s + l.valor, 0)
  );

  return {
    cooperativaId,
    pagamentosSemDebitoCaixa,
    pagamentosSemTaxaCoopCaixa,
    pagamentosSemMensalidadeFichaCaixa,
    mensalidadesPagasSemCreditoCaixa,
    totais: {
      debitosPagamentoEsperados: round2(debitosPagamentoEsperados),
      debitosPagamentoCaixa,
      creditosTaxaEsperados: round2(creditosTaxaEsperados),
      creditosTaxaCaixa,
      creditosMensFichaEsperados: round2(creditosMensFichaEsperados),
      creditosMensFichaCaixa,
    },
  };
}

export function mesesLivroCaixa(data: AppData, cooperativaId: string): string[] {
  const set = new Set((data.livroCaixa ?? []).filter((l) => l.cooperativaId === cooperativaId).map((l) => l.mesReferencia));
  set.add(getCurrentMesReferencia());
  return [...set].sort().reverse();
}

/** Mês com movimento mais recente — evita abrir em mês corrente vazio. */
export function mesReferenciaInicialLivroCaixa(data: AppData, cooperativaId: string): string {
  for (const m of mesesLivroCaixa(data, cooperativaId)) {
    if (lancamentosLivroCaixa(data, cooperativaId, m).length > 0) return m;
  }
  return getCurrentMesReferencia();
}

const ORIGENS_LANCAMENTO_MANUAL: LivroCaixaOrigem[] = [
  "manual",
  "credito_avulso",
  "debito_avulso",
  "pnae",
  "outro",
];

export function isLancamentoManualEditavel(l: LivroCaixaLancamento): boolean {
  if (l.origemId?.trim()) return false;
  return ORIGENS_LANCAMENTO_MANUAL.includes(l.origem);
}

export function isLancamentoSemSequenciaLegado(l: LivroCaixaLancamento): boolean {
  return l.numeroSequencia == null;
}

export function podeExcluirLancamentoLivroCaixa(l: LivroCaixaLancamento): boolean {
  return isLancamentoManualEditavel(l);
}

export function atualizarLancamentoManual(
  data: AppData,
  cooperativaId: string,
  lancamentoId: string,
  patch: {
    tipo: LivroCaixaTipo;
    valor: number;
    historico: string;
    data?: string;
    origem?: LivroCaixaOrigem;
  }
): AppData {
  const idx = (data.livroCaixa ?? []).findIndex((l) => l.id === lancamentoId && l.cooperativaId === cooperativaId);
  if (idx < 0) return data;
  const cur = data.livroCaixa![idx];
  if (!isLancamentoManualEditavel(cur)) return data;

  const dataLanc = patch.data ?? cur.data;
  let origem = patch.origem ?? cur.origem;
  if (patch.tipo === "credito" && origem === "debito_avulso") origem = "credito_avulso";
  if (patch.tipo === "debito" && (origem === "credito_avulso" || origem === "pnae")) origem = "debito_avulso";
  if (!ORIGENS_LANCAMENTO_MANUAL.includes(origem)) return data;

  const nextItem: LivroCaixaLancamento = {
    ...cur,
    tipo: patch.tipo,
    valor: Math.abs(patch.valor),
    historico: patch.historico.trim(),
    data: dataLanc,
    mesReferencia: mesFromData(dataLanc),
    origem,
    updatedAt: new Date().toISOString(),
  };

  const livroCaixa = [...(data.livroCaixa ?? [])];
  livroCaixa[idx] = nextItem;
  return { ...data, livroCaixa };
}

export function excluirLancamentoLivroCaixa(data: AppData, cooperativaId: string, lancamentoId: string): AppData {
  const alvo = (data.livroCaixa ?? []).find((l) => l.id === lancamentoId && l.cooperativaId === cooperativaId);
  if (!alvo || !podeExcluirLancamentoLivroCaixa(alvo)) return data;
  const excluidoEm = new Date().toISOString();
  return {
    ...data,
    livroCaixa: (data.livroCaixa ?? []).filter((l) => l.id !== lancamentoId),
    livroCaixaExcluidos: [
      ...(data.livroCaixaExcluidos ?? []).filter((e) => e.id !== lancamentoId),
      { id: lancamentoId, cooperativaId, excluidoEm },
    ],
  };
}

function isResponsavelEncerramento(user: Pick<User, "role">): boolean {
  return user.role === "admin" || user.role === "tesoureiro" || user.role === "responsavel";
}

export function solicitarEncerramentoAnoLivroCaixa(
  data: AppData,
  cooperativaId: string,
  user: Pick<User, "id" | "name" | "role">,
  input: {
    anoEncerrado: number;
    backupConfirmado: boolean;
    relatoriosImpressosConfirmados: boolean;
  }
): AppData {
  if (!isResponsavelEncerramento(user)) return data;
  if (!input.backupConfirmado || !input.relatoriosImpressosConfirmados) return data;

  let next = ensureControleAnualLivroCaixa(data, cooperativaId);
  const controle = getControleAnualLivroCaixa(next, cooperativaId)!;
  if (input.anoEncerrado !== controle.anoLivro) return data;

  const pendente = {
    anoEncerrado: input.anoEncerrado,
    novoAnoLivro: input.anoEncerrado + 1,
    backupConfirmado: true,
    relatoriosImpressosConfirmados: true,
    responsavelUserId: user.id,
    responsavelNome: user.name,
    responsavelConfirmadoEm: new Date().toISOString(),
  };

  return upsertControle(next, { ...controle, encerramentoPendente: pendente });
}

export function confirmarEncerramentoAnoLivroCaixaContador(
  data: AppData,
  cooperativaId: string,
  user: Pick<User, "id" | "name" | "role">
): AppData {
  if (user.role !== "contador") return data;
  const controle = getControleAnualLivroCaixa(data, cooperativaId);
  const pendente = controle?.encerramentoPendente;
  if (!controle || !pendente) return data;

  const registro = {
    anoEncerrado: pendente.anoEncerrado,
    encerradoEm: new Date().toISOString(),
    responsavelUserId: pendente.responsavelUserId,
    responsavelNome: pendente.responsavelNome,
    contadorUserId: user.id,
    contadorNome: user.name,
    backupConfirmado: pendente.backupConfirmado,
    relatoriosImpressosConfirmados: pendente.relatoriosImpressosConfirmados,
  };

  return upsertControle(data, {
    ...controle,
    anoLivro: pendente.novoAnoLivro,
    proximoSequencia: 1,
    encerramentoPendente: undefined,
    historicoEncerramentos: [...(controle.historicoEncerramentos ?? []), registro],
  });
}

export function mergeLivroCaixaControleAnualFromCloud(
  local: LivroCaixaControleAnual | undefined,
  cloud: LivroCaixaControleAnual | undefined
): LivroCaixaControleAnual | undefined {
  if (!local && !cloud) return undefined;
  if (!local) return cloud;
  if (!cloud) return local;
  const localTs = local.updatedAt ?? "";
  const cloudTs = cloud.updatedAt ?? "";
  const base = cloudTs > localTs ? cloud : local;
  const other = base === cloud ? local : cloud;
  if (base.anoLivro === other.anoLivro) {
    return {
      ...base,
      proximoSequencia: Math.max(base.proximoSequencia, other.proximoSequencia),
      encerramentoPendente: base.encerramentoPendente ?? other.encerramentoPendente,
      historicoEncerramentos: [
        ...(base.historicoEncerramentos ?? []),
        ...(other.historicoEncerramentos ?? []),
      ],
    };
  }
  return base.anoLivro > other.anoLivro ? base : other;
}
