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
import { getCurrentMesReferencia } from "@/utils/format";

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

function compareLancamentoSequencia(a: LivroCaixaLancamento, b: LivroCaixaLancamento): number {
  const aSeq = a.numeroSequencia ?? Number.MAX_SAFE_INTEGER;
  const bSeq = b.numeroSequencia ?? Number.MAX_SAFE_INTEGER;
  if (aSeq !== bSeq) return aSeq - bSeq;
  if (a.numeroSequencia != null && b.numeroSequencia != null && a.numeroSequencia === b.numeroSequencia) {
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

function pagamentoIdFromOrigemId(origemId?: string): string | null {
  if (!origemId) return null;
  const m = origemId.match(/^pg_(?:caixa|taxa|mensficha|desc)_(.+)$/);
  return m?.[1] ?? null;
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
  const totalMens = round2(mensalidades.reduce((s, d) => s + d.valor, 0));
  if (totalMens > 0) {
    next = appendLivroCaixaLancamento(
      next,
      {
        ...base,
        tipo: "credito",
        valor: totalMens,
        historico: `Mensalidade retida na ficha · ${nome} · ${pagamento.mesReferencia}`,
        origem: "mensalidade_ficha",
        origemId: `pg_mensficha_${pagamento.id}`,
      },
      ctx
    );
  }

  const outrosDescontos = (pagamento.descontosExtras ?? []).filter(
    (d) => d.tipo !== "mensalidade" && d.tipo !== "credito_avulso" && d.tipo !== "cooperativa" && d.valor > 0
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

export function lancarPagamentoCooperadoNoCaixa(data: AppData, pagamento: PagamentoCooperadoRegistro): AppData {
  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
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
        historico: `Pagamento cooperado ${cooperado?.nomeCompleto ?? ""} · ${pagamento.mesReferencia}`,
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
    const atualizado = lancarRetencoesPagamentoNoCaixa(next, pagamento);
    if (atualizado !== next) next = atualizado;
  }
  return next;
}

export function mesesLivroCaixa(data: AppData, cooperativaId: string): string[] {
  const set = new Set((data.livroCaixa ?? []).filter((l) => l.cooperativaId === cooperativaId).map((l) => l.mesReferencia));
  set.add(getCurrentMesReferencia());
  return [...set].sort().reverse();
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
