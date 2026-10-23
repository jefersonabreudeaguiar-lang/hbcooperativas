/**
 * Índices cacheados por revisão do AppData — painel responsável (fila, dashboard).
 * Read-only; não altera lançamentos.
 */
import type { AppData, Cooperado, NotaPedido, PagamentoCooperadoRegistro } from "@/types";
import { cooperadoPendentePagamentoResponsavel } from "@/services/cooperadoEntregasService";
import {
  fichaPertenceCooperado,
  listCooperadosDaCooperativa,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { getDataOperationalTruth, getDataRevision } from "@/services/dataStore";
import { peekStaffGestaoLastGood } from "@/lib/staff/staffGestaoSnapshotGuard";
import { valorAPagarCooperadoEmAberto } from "@/lib/responsavel/responsavelGestaoLeitura";
import { unirValoresAvulsosReceber } from "@/services/valoresAvulsosReceberService";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { listarMesesFichaEmAbertoCooperado } from "@/lib/hb-credit/hbCreditCreditoBaseCalculo";
import {
  alinharFichaComPagamentosCooperativa,
  repararIntegridadePagamentosCooperativa,
} from "@/services/pagamentoIntegridadeService";
import {
  idsNotasPedidoExcluidas,
  listarFichasEmAbertoPagamento,
  listarPagamentosConfirmadosQueCobremMes,
  notaQuitadaPorPagamentoCooperativaRegistrado,
  reconciliarFichaFromNotasConferidas,
} from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import {
  isNotaStatusDowngrade,
  notaElegivelParaFilaConferenciaResponsavel,
  notaLancadaNaFichaCorrida,
  notaResolvidaForaDaFilaConferir,
  protectNotaAgainstStatusDowngrade,
  sanitizarNotaParaFilaConferencia,
} from "@/utils/notaStatus";
import {
  getRelatorioPagarCooperadoEmAberto,
  type LinhaPagarCooperadoEmAberto,
} from "@/services/relatorioService";
import { formatMesesReferenciaRotulo, formatMesReferencia } from "@/utils/format";

type PainelCache = {
  revision: number;
  coopId: string;
  filaNotas: NotaPedido[];
  cooperadosPagar: Cooperado[];
  cooperadosPagarCount: number;
};

let painelCache: PainelCache | null = null;
let pagarProjCache: { revision: number; coopId: string; data: AppData } | null = null;

type RelatorioAbertoCache = {
  revision: number;
  coopId: string;
  pix: number;
  fichas: number;
  notas: number;
  linhas: LinhaPagarCooperadoEmAberto[];
};

let relatorioAbertoCache: RelatorioAbertoCache | null = null;
let relatorioAbertoLatch: { coopId: string; linhas: LinhaPagarCooperadoEmAberto[] } | null = null;
const conferirLeituraLatchByKey = new Map<string, AppData>();
let conferirLatchBuild = APP_BUILD_VERSION;

function garantirCacheDoBuildAtual(): void {
  if (conferirLatchBuild === APP_BUILD_VERSION) return;
  painelCache = null;
  pagarProjCache = null;
  relatorioAbertoCache = null;
  relatorioAbertoLatch = null;
  conferirLeituraLatchByKey.clear();
  conferirLatchBuild = APP_BUILD_VERSION;
}

function cooperadoIdsDaCooperativa(data: AppData, coopId: string): Set<string> {
  const ids = new Set<string>();
  for (const c of data.cooperados) {
    if (c.cooperativaId === coopId) ids.add(c.id);
  }
  return ids;
}

/** ID do cadastro na cooperativa — notas/fichas legadas podem apontar para outro cooperado_id. */
function cooperadoIdListagemPagarNaCooperativa(
  data: AppData,
  cooperadoId: string,
  coopId: string,
  coopIds: Set<string>
): string | null {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  if (coopIds.has(canon)) return canon;
  if (coopIds.has(cooperadoId)) return cooperadoId;
  return null;
}

function cooperadoLinhaCobrePorPixConfirmado(
  data: AppData,
  cooperadoId: string,
  coopId: string,
  mesesLinha?: string[]
): boolean {
  const confirmados = (data.pagamentosCooperado ?? []).filter((p) => {
    if (p.status !== "confirmado") return false;
    if (p.cooperativaId && p.cooperativaId !== coopId) return false;
    const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
    const pCanon = resolverCooperadoIdCanonico(data, p.cooperadoId, p.cooperativaId ?? coopId);
    return p.cooperadoId === cooperadoId || p.cooperadoId === canon || pCanon === canon;
  });
  if (!confirmados.length) return false;
  const meses = (mesesLinha ?? []).filter(Boolean);
  if (!meses.length) return true;
  return meses.every(
    (mes) => listarPagamentosConfirmadosQueCobremMes(data, cooperadoId, mes, coopId).length > 0
  );
}

/** Nota conferida ainda sem PIX — entra na aba Pagar mesmo sem ficha persistida. */
export function cooperadoTemNotaConferidaSemPix(
  data: AppData,
  cooperadoId: string,
  coopId?: string
): boolean {
  return listarNotasConferidasSemPixCooperado(data, cooperadoId, coopId).length > 0;
}

export function listarMesesNotaConferidaSemPix(
  data: AppData,
  cooperadoId: string,
  coopId?: string
): string[] {
  const meses = new Set<string>();
  for (const n of listarNotasConferidasSemPixCooperado(data, cooperadoId, coopId)) {
    if (n.mesReferencia) meses.add(n.mesReferencia);
  }
  return [...meses].sort();
}

function listarNotasConferidasSemPixCooperado(
  data: AppData,
  cooperadoId: string,
  coopId?: string
): NotaPedido[] {
  if (!cooperadoId || !coopId) return [];
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const excluidas = idsNotasPedidoExcluidas(data, coopId);
  const out: NotaPedido[] = [];
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId !== coopId) continue;
    if (n.status !== "conferida") continue;
    if (excluidas.has(n.id)) continue;
    if (n.valorLiquido <= 0 && (n.itens ?? []).every((i) => i.quantidade <= 0)) continue;
    const nCanon = resolverCooperadoIdCanonico(data, n.cooperadoId, n.cooperativaId);
    if (n.cooperadoId !== cooperadoId && n.cooperadoId !== canonico && nCanon !== canonico) {
      continue;
    }
    if (notaQuitadaPorPagamentoCooperativaRegistrado(data, n, n.cooperadoId)) continue;
    out.push(n);
  }
  return out;
}

/**
 * Leitura da ficha ainda sem PIX — Conferir pode marcar nota/ficha como paga e esvaziar Pagar/Em aberto.
 * Só leitura; não persiste.
 */
function appDataParaLeituraFichaEmAbertoResponsavel(data: AppData, coopId?: string): AppData {
  const leituraConferir = appDataParaConferirLeitura(data, coopId);
  return completarFichaProjetadaComNota(
    alinharFichaComPagamentosCooperativa(
      repararIntegridadePagamentosCooperativa(leituraConferir, { forcar: true })
    )
  );
}

/**
 * Foto da aba Pagar: lastro do Conferir + ficha reconstruída das notas conferidas.
 * Só leitura — não persiste.
 */
function numeroFichaOuNotaValido(n: number | undefined): boolean {
  return Number.isFinite(Number(n)) && Number(n) > 0.005;
}

/** A projeção não pode apagar o R$ que já estava na nota/ficha. */
function preservarValoresNumericosDaFonte(fonte: AppData, projetado: AppData): AppData {
  const notasFonte = new Map((fonte.notasPedido ?? []).map((n) => [n.id, n]));
  let notasChanged = false;
  const notas = (projetado.notasPedido ?? []).map((n) => {
    const orig = notasFonte.get(n.id);
    if (!orig || numeroFichaOuNotaValido(n.valorLiquido) || numeroFichaOuNotaValido(n.valorBruto)) {
      return n;
    }
    if (!numeroFichaOuNotaValido(orig.valorLiquido) && !numeroFichaOuNotaValido(orig.valorBruto)) {
      return n;
    }
    notasChanged = true;
    return {
      ...n,
      valorBruto: orig.valorBruto,
      valorLiquido: orig.valorLiquido,
      valorDesconto: orig.valorDesconto,
    };
  });
  const nextNotas = notasChanged ? { ...projetado, notasPedido: notas } : projetado;
  const fichasFonte = new Map((fonte.fichaCorrida ?? []).map((f) => [f.id, f]));
  let fichasChanged = false;
  const fichas = (nextNotas.fichaCorrida ?? []).map((f) => {
    const orig = fichasFonte.get(f.id);
    if (!orig || numeroFichaOuNotaValido(f.valorLiquido) || numeroFichaOuNotaValido(f.valorBruto)) {
      return f;
    }
    if (!numeroFichaOuNotaValido(orig.valorLiquido) && !numeroFichaOuNotaValido(orig.valorBruto)) {
      return f;
    }
    fichasChanged = true;
    return {
      ...f,
      valorBruto: orig.valorBruto,
      valorLiquido: orig.valorLiquido,
      descontos: orig.descontos,
    };
  });
  const next = fichasChanged ? { ...nextNotas, fichaCorrida: fichas } : nextNotas;
  return completarFichaProjetadaComNota(next);
}

export function appDataParaPagarCooperadosResponsavel(data: AppData, coopId?: string): AppData {
  garantirCacheDoBuildAtual();
  const revision = getDataRevision();
  const key = coopId ?? "";
  if (pagarProjCache && pagarProjCache.revision === revision && pagarProjCache.coopId === key) {
    return pagarProjCache.data;
  }
  const leitura = appDataParaLeituraFichaEmAbertoResponsavel(data, coopId);
  const projetado = preservarValoresNumericosDaFonte(
    data,
    alinharFichaComPagamentosCooperativa(reconciliarFichaFromNotasConferidas(leitura))
  );
  const next = {
    ...projetado,
    valoresAvulsosReceber: unirValoresAvulsosReceber(
      projetado.valoresAvulsosReceber,
      data.valoresAvulsosReceber
    ),
  };
  pagarProjCache = { revision, coopId: key, data: next };
  return next;
}

/** Projeção às vezes nasce sem líquido — completa com o valor real da nota conferida. */
function completarFichaProjetadaComNota(data: AppData): AppData {
  let changed = false;
  const fichas = (data.fichaCorrida ?? []).map((f) => {
    const liq = Number(f.valorLiquido);
    const bruto = Number(f.valorBruto);
    if (Number.isFinite(liq) && liq > 0.005) return f;
    if (Number.isFinite(bruto) && bruto > 0.005) return f;
    const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
    if (!nota) return f;
    const nLiq = Number(nota.valorLiquido);
    const nBruto = Number(nota.valorBruto);
    if (!(nLiq > 0.005) && !(nBruto > 0.005)) return f;
    changed = true;
    return {
      ...f,
      valorBruto: nBruto > 0.005 ? nBruto : f.valorBruto,
      valorLiquido: nLiq > 0.005 ? nLiq : nBruto,
      descontos: Number.isFinite(Number(nota.valorDesconto)) ? Number(nota.valorDesconto) : f.descontos,
    };
  });
  return changed ? { ...data, fichaCorrida: fichas } : data;
}

function candidatosCooperadoPagamento(data: AppData, coopId: string): Set<string> {
  const coopIds = cooperadoIdsDaCooperativa(data, coopId);
  const candidatos = new Set<string>();
  const add = (cooperadoId: string) => {
    const id = cooperadoIdListagemPagarNaCooperativa(data, cooperadoId, coopId, coopIds);
    if (id) candidatos.add(id);
  };
  for (const f of data.fichaCorrida ?? []) {
    if (f.cooperativaId && f.cooperativaId !== coopId) continue;
    if (f.status === "pendente" || f.status === "pago") add(f.cooperadoId);
  }
  for (const p of data.pagamentosCooperado ?? []) {
    if (p.cooperativaId !== coopId) continue;
    if (p.status === "aguardando_confirmacao" || p.status === "confirmado") {
      add(p.cooperadoId);
    }
  }
  for (const v of data.valoresAvulsosReceber ?? []) {
    if (v.cooperativaId !== coopId) continue;
    if (v.status === "pendente") add(v.cooperadoId);
  }
  const excluidas = idsNotasPedidoExcluidas(data, coopId);
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId !== coopId) continue;
    if (n.status !== "conferida") continue;
    if (excluidas.has(n.id)) continue;
    if (n.valorLiquido <= 0 && (n.itens ?? []).every((i) => i.quantidade <= 0)) continue;
    add(n.cooperadoId);
  }
  return candidatos;
}

function mergeNotasPedidoParaPainel(truth: NotaPedido[], react: NotaPedido[]): NotaPedido[] {
  if (react.length === 0) return truth;
  if (truth.length === 0) return react;
  const byId = new Map<string, NotaPedido>();
  for (const n of truth) byId.set(n.id, n);
  for (const n of react) {
    const prev = byId.get(n.id);
    byId.set(n.id, prev ? protectNotaAgainstStatusDowngrade(prev, n) : n);
  }
  return [...byId.values()];
}

function notaRiquezaAtualizacao(n: NotaPedido): { ts: number; fotos: number } {
  const ts = Date.parse(n.updatedAt ?? n.createdAt ?? "") || 0;
  const fotos = Math.max(
    n.fotosEnviadasCount ?? 0,
    n.fotosPedido?.length ?? 0,
    n.fotoPedido ? 1 : 0
  );
  return { ts, fotos };
}

/** Snapshot pobre: entra nota nova e atualiza foto/status sem apagar o lastro. */
function mergeNotasPreferindoAtualizacao(prev: NotaPedido[], incoming: NotaPedido[]): NotaPedido[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  for (const n of incoming) {
    const old = byId.get(n.id);
    if (!old) {
      byId.set(n.id, n);
      continue;
    }
    const a = notaRiquezaAtualizacao(old);
    const b = notaRiquezaAtualizacao(n);
    if (isNotaStatusDowngrade(old.status, n.status)) {
      if (b.fotos > a.fotos) {
        byId.set(n.id, {
          ...n,
          ...old,
          fotosPedido:
            (n.fotosPedido?.length ?? 0) > (old.fotosPedido?.length ?? 0) ? n.fotosPedido : old.fotosPedido,
          fotoPedido: n.fotoPedido ?? old.fotoPedido,
          fotosEnviadasCount: Math.max(old.fotosEnviadasCount ?? 0, n.fotosEnviadasCount ?? 0),
        });
      }
      continue;
    }
    if (b.ts > a.ts || b.fotos > a.fotos) {
      byId.set(n.id, { ...old, ...n });
    }
  }
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

function rankPagamentoConferir(p: PagamentoCooperadoRegistro): number {
  let rank = 0;
  if (p.status === "confirmado") rank += 4;
  if (p.status === "aguardando_confirmacao") rank += 2;
  rank += (p.fichaIds?.length ?? 0) + (p.notaPedidoIds?.length ?? 0);
  return rank;
}

/** União de PIX: o lastro de fichas não pode descartar pagamento que acabou de chegar. */
export function mergePagamentosCooperadoParaConferir(
  a: PagamentoCooperadoRegistro[] | undefined,
  b: PagamentoCooperadoRegistro[] | undefined
): PagamentoCooperadoRegistro[] {
  const byId = new Map<string, PagamentoCooperadoRegistro>();
  for (const p of a ?? []) {
    if (p?.id) byId.set(p.id, p);
  }
  for (const p of b ?? []) {
    if (!p?.id) continue;
    const prev = byId.get(p.id);
    if (!prev || rankPagamentoConferir(p) >= rankPagamentoConferir(prev)) {
      byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}

/** Snapshot incompleto (sync/push) não substitui o último completo. PIX extra entra no merge, não apaga ficha. */
export function snapshotConferirPoorerSemProva(next: AppData, prev: AppData): boolean {
  const n = scoreSnapshotConferir(next);
  const p = scoreSnapshotConferir(prev);
  if (n.cooperados === 0 && p.cooperados > 0) return true;
  if (n.notas === 0 && p.notas > 0 && n.pix <= p.pix) return true;
  if (n.fichas === 0 && p.fichas > 0) return true;
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
  const pagamentosCooperado = mergePagamentosCooperadoParaConferir(
    base.pagamentosCooperado,
    other.pagamentosCooperado
  );
  const valoresAvulsosReceber = unirValoresAvulsosReceber(
    base.valoresAvulsosReceber,
    other.valoresAvulsosReceber
  );
  const notasMudou = notasPedido !== base.notasPedido;
  const pixMudou = pagamentosCooperado.length !== (base.pagamentosCooperado?.length ?? 0);
  const baseAvulsos = base.valoresAvulsosReceber ?? [];
  const avulsosMudou =
    valoresAvulsosReceber.length !== baseAvulsos.length ||
    valoresAvulsosReceber.some((v) => {
      const old = baseAvulsos.find((x) => x.id === v.id);
      return !old || old.updatedAt !== v.updatedAt;
    });
  if (!notasMudou && !pixMudou && !avulsosMudou) return base;
  return { ...base, notasPedido, pagamentosCooperado, valoresAvulsosReceber };
}

function aplicarLastroCompletenessConferir(candidato: AppData, key = "_"): AppData {
  const prev = conferirLeituraLatchByKey.get(key);
  if (!prev || !snapshotConferirPoorerSemProva(candidato, prev)) {
    conferirLeituraLatchByKey.set(key, candidato);
    return candidato;
  }
  const pagamentosCooperado = mergePagamentosCooperadoParaConferir(
    prev.pagamentosCooperado,
    candidato.pagamentosCooperado
  );
  const fichaById = new Map((prev.fichaCorrida ?? []).map((f) => [f.id, f]));
  for (const f of candidato.fichaCorrida ?? []) {
    const old = fichaById.get(f.id);
    if (!old || f.status === "pago" || old.status !== "pago") fichaById.set(f.id, f);
  }
  const fundido = alinharFichaComPagamentosCooperativa({
    ...prev,
    fichaCorrida: [...fichaById.values()],
    notasPedido: mergeNotasPreferindoAtualizacao(prev.notasPedido, candidato.notasPedido),
    pagamentosCooperado,
    valoresAvulsosReceber: unirValoresAvulsosReceber(
      prev.valoresAvulsosReceber,
      candidato.valoresAvulsosReceber
    ),
  });
  conferirLeituraLatchByKey.set(key, fundido);
  return fundido;
}

/**
 * Foto única da aba Conferir: verdade operacional + merge de notas, com lastro de completeness.
 * PIX confirmado alinha ficha/nota a pago antes do lastro — pago não volta a em aberto.
 * Lastro por cooperativa — uma CNPJ não herda a fila da outra.
 */
export function appDataParaConferirLeitura(data: AppData, coopId?: string): AppData {
  garantirCacheDoBuildAtual();
  const key = coopId || "_";
  if (!conferirLeituraLatchByKey.has(key)) {
    const lkg = peekStaffGestaoLastGood();
    if (lkg && ((lkg.notasPedido?.length ?? 0) > 0 || (lkg.fichaCorrida?.length ?? 0) > 0)) {
      conferirLeituraLatchByKey.set(key, lkg);
    }
  }
  const truth = getDataOperationalTruth();
  const merged = escolherSnapshotMaisCompleto(truth, data);
  return aplicarLastroCompletenessConferir(alinharFichaComPagamentosCooperativa(merged), key);
}

/**
 * Sai do Em aberto quando não há ficha sem PIX.
 * Sem ficha = sync incompleto — não tira, salvo se o PIX confirmado já cobre os meses da linha presa.
 */
export function cooperadoEmAbertoPodeSair(
  data: AppData,
  cooperadoId: string,
  coopId: string,
  mesesLinha?: string[]
): boolean {
  if (!cooperadoId || !coopId) return false;
  const aberto = listarMesesFichaEmAbertoCooperado(data, cooperadoId, coopId, {
    usarLiquido: true,
  });
  if (aberto.total > 0.005) return false;
  if (cooperadoLinhaCobrePorPixConfirmado(data, cooperadoId, coopId, mesesLinha)) return true;
  const temFicha = (data.fichaCorrida ?? []).some((f) =>
    fichaPertenceCooperado(data, f, cooperadoId, coopId)
  );
  if (temFicha) return true;
  const meses = (mesesLinha ?? []).filter(Boolean);
  if (!meses.length) return false;
  return meses.every(
    (mes) => listarPagamentosConfirmadosQueCobremMes(data, cooperadoId, mes, coopId).length > 0
  );
}

function linhaEmAbertoSoFichaSemPix(
  base: LinhaPagarCooperadoEmAberto,
  data: AppData,
  coopId: string
): LinhaPagarCooperadoEmAberto | null {
  const aberto = valorAPagarCooperadoEmAberto(data, base.cooperadoId, coopId);
  if (aberto.total <= 0.005) return null;
  return {
    ...base,
    meses: aberto.meses,
    mesesLabel: formatMesesReferenciaRotulo(aberto.meses),
    entregas: aberto.porMes.reduce((s, m) => s + m.entregas, 0),
    total: aberto.total,
    porMes: aberto.porMes.map((m) => ({
      mes: m.mes,
      mesLabel: formatMesReferencia(m.mes),
      entregas: m.entregas,
      total: m.total,
    })),
  };
}

/** Mês com PIX confirmado sai do Em aberto, salvo entrega com data depois do pagamento. */
function mesPagoDeveSairDoEmAberto(
  data: AppData,
  cooperadoId: string,
  mes: string,
  coopId: string
): boolean {
  const pixes = listarPagamentosConfirmadosQueCobremMes(data, cooperadoId, mes, coopId);
  if (!pixes.length) return false;
  const pagoTs = Math.max(
    ...pixes.map((p) => Date.parse(p.pagoEm ?? p.createdAt ?? "")).filter((n) => Number.isFinite(n)),
    0
  );
  const leftover = listarFichasEmAbertoPagamento(data, cooperadoId, mes, coopId);
  if (!leftover.length) return true;
  return leftover.every((f) => {
    const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
    if (!nota?.dataEntrega) return true;
    const raw =
      nota.dataEntrega.length === 10 ? `${nota.dataEntrega}T00:00:00.000Z` : nota.dataEntrega;
    const ts = Date.parse(raw);
    return Number.isNaN(ts) || ts <= pagoTs;
  });
}

/** Tira do card o mês que o PIX já cobriu. Sync pobre não devolve mês liquidado. */
function recortarLinhaEmAbertoMesesSemPix(
  linha: LinhaPagarCooperadoEmAberto,
  data: AppData,
  coopId: string
): LinhaPagarCooperadoEmAberto | null {
  const porMes = (linha.porMes ?? []).filter((m) => {
    if (!m.mes || m.total <= 0.005) return false;
    return !mesPagoDeveSairDoEmAberto(data, linha.cooperadoId, m.mes, coopId);
  });
  if (porMes.length === 0) return null;
  if (porMes.length === (linha.porMes?.length ?? 0)) return linha;
  const meses = porMes.map((m) => m.mes);
  const total = round2(porMes.reduce((s, m) => s + m.total, 0));
  if (total <= 0.005) return null;
  return {
    ...linha,
    meses,
    mesesLabel: formatMesesReferenciaRotulo(meses),
    entregas: porMes.reduce((s, m) => s + m.entregas, 0),
    total,
    porMes,
  };
}

/** Lastro sem valor já coberto por PIX — mês pago some; só fica o que ainda não foi pago. */
function linhaEmAbertoSemValoresPagos(
  base: LinhaPagarCooperadoEmAberto,
  data: AppData,
  coopId: string
): LinhaPagarCooperadoEmAberto | null {
  const vivo = linhaEmAbertoSoFichaSemPix(base, data, coopId);
  if (vivo) return recortarLinhaEmAbertoMesesSemPix(vivo, data, coopId);
  if (cooperadoEmAbertoPodeSair(data, base.cooperadoId, coopId, base.meses)) return null;
  if (base.total <= 0.005) return null;
  return recortarLinhaEmAbertoMesesSemPix(base, data, coopId);
}

/** Lastro só contra lista vazia. Valor já pago não volta; total vem só da ficha sem PIX. */
export function fundirLinhasEmAbertoEstavel(
  anterior: LinhaPagarCooperadoEmAberto[],
  motor: LinhaPagarCooperadoEmAberto[],
  data: AppData,
  coopId: string
): LinhaPagarCooperadoEmAberto[] {
  const motorLimpo = motor
    .map((l) => linhaEmAbertoSemValoresPagos(l, data, coopId))
    .filter((l): l is LinhaPagarCooperadoEmAberto => l !== null);

  if (anterior.length === 0) return motorLimpo;
  /** Motor com linhas = leitura atual; não reidrata cooperados fantasmas do latch (ex.: 24 vs 12). */
  if (motorLimpo.length > 0) {
    return motorLimpo.sort((a, b) => a.cooperado.localeCompare(b.cooperado, "pt-BR"));
  }

  const byId = new Map(motorLimpo.map((l) => [l.cooperadoId, l]));
  for (const old of anterior) {
    if (byId.has(old.cooperadoId)) continue;
    if (cooperadoEmAbertoPodeSair(data, old.cooperadoId, coopId, old.meses)) continue;
    const vivo = linhaEmAbertoSemValoresPagos(old, data, coopId);
    if (vivo) byId.set(old.cooperadoId, vivo);
  }
  return [...byId.values()].sort((a, b) => a.cooperado.localeCompare(b.cooperado, "pt-BR"));
}

/** Lista da fila a partir de um snapshot — sem cache da revisão ao vivo. */
export function listNotasFilaConferenciaDeDados(data: AppData, coopId: string): NotaPedido[] {
  if (!coopId) return [];
  return coletarFilaNotasConferir(data, coopId);
}

/** Fila vazia depois de lançar ≠ fila perdida. Só recupera se o lastro ainda tem foto sem ficha. */
export function deveRecuperarFilaConferirVazia(
  lastro: AppData | null | undefined,
  live: AppData | null | undefined,
  coopId: string
): boolean {
  if (!coopId) return false;
  const livePendentes = live ? coletarFilaNotasConferir(live, coopId) : [];
  if (livePendentes.length > 0) return false;
  const lastroPendentes = lastro ? coletarFilaNotasConferir(lastro, coopId) : [];
  const orfas = lastroPendentes.filter(
    (n) => !notaLancadaNaFichaCorrida(live?.fichaCorrida, n.id)
  );
  if (orfas.length > 0) return true;
  const temFicha = (live?.fichaCorrida?.length ?? 0) > 0 || (lastro?.fichaCorrida?.length ?? 0) > 0;
  return !temFicha;
}

function coletarFilaNotasConferir(data: AppData, coopId: string): NotaPedido[] {
  const excluidas = idsNotasPedidoExcluidas(data, coopId);
  const filaNotas: NotaPedido[] = [];
  for (const n of data.notasPedido ?? []) {
    if (notaLancadaNaFichaCorrida(data.fichaCorrida, n.id)) continue;
    const candidata = sanitizarNotaParaFilaConferencia(n);
    if (!notaElegivelParaFilaConferenciaResponsavel(candidata)) continue;
    if (!notaPertenceCooperativa(data, n, coopId)) continue;
    if (excluidas.has(n.id)) continue;
    filaNotas.push(candidata);
  }
  filaNotas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filaNotas;
}

function buildPainelCache(data: AppData, live: AppData, coopId: string): PainelCache {
  const evidencia = {
    notasPedido: [...(live.notasPedido ?? []), ...(data.notasPedido ?? [])],
    fichaCorrida: [...(live.fichaCorrida ?? []), ...(data.fichaCorrida ?? [])],
  };
  const byId = new Map<string, NotaPedido>();
  for (const n of coletarFilaNotasConferir(data, coopId)) {
    if (notaResolvidaForaDaFilaConferir(evidencia, n.id)) continue;
    byId.set(n.id, n);
  }
  for (const n of coletarFilaNotasConferir(live, coopId)) {
    if (byId.has(n.id)) continue;
    if (notaResolvidaForaDaFilaConferir(evidencia, n.id)) continue;
    byId.set(n.id, n);
  }
  const filaNotas = [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const dataPagar = appDataParaLeituraFichaEmAbertoResponsavel(live, coopId);
  const candidatos = candidatosCooperadoPagamento(dataPagar, coopId);
  const cooperadosPagar: Cooperado[] = [];
  if (candidatos.size > 0) {
    for (const c of listCooperadosDaCooperativa(dataPagar, coopId)) {
      if (!candidatos.has(c.id)) continue;
      if (
        cooperadoPendentePagamentoResponsavel(dataPagar, c.id, undefined, coopId) ||
        cooperadoTemNotaConferidaSemPix(dataPagar, c.id, coopId)
      ) {
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
  painelCache = buildPainelCache(appDataParaConferirLeitura(data, coopId), data, coopId);
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
  const linhas = getRelatorioLancamentosEmAbertoResponsavel(data, coopId);
  const byId = new Map(listCooperadosDaCooperativa(data, coopId).map((c) => [c.id, c]));
  const out: Cooperado[] = [];
  const seen = new Set<string>();
  for (const l of linhas) {
    if (seen.has(l.cooperadoId)) continue;
    seen.add(l.cooperadoId);
    const c = byId.get(l.cooperadoId);
    if (c) {
      out.push(c);
      continue;
    }
    out.push({
      id: l.cooperadoId,
      nomeCompleto: l.cooperado,
      cooperativaId: coopId,
      status: "ativo",
    } as Cooperado);
  }
  if (out.length > 0) return out;
  return getPainelCache(data, coopId).cooperadosPagar;
}

export function countCooperadosPagamentoPendenteResponsavel(data: AppData, coopId: string): number {
  if (!coopId) return 0;
  return listCooperadosPagamentoPendenteResponsavel(data, coopId).length;
}

function linhaEmAbertoDeNotasSemFicha(
  data: AppData,
  cooperadoId: string,
  coopId: string,
  nome: string
): LinhaPagarCooperadoEmAberto | null {
  const notas = listarNotasConferidasSemPixCooperado(data, cooperadoId, coopId);
  if (!notas.length) return null;
  const porMesMap = new Map<string, { entregas: number; total: number }>();
  for (const n of notas) {
    const mes = n.mesReferencia;
    if (!mes) continue;
    const liq = Number(n.valorLiquido);
    const bruto = Number(n.valorBruto);
    const valor = liq > 0.005 ? liq : bruto > 0.005 ? bruto : 0;
    if (valor <= 0.005) continue;
    const cur = porMesMap.get(mes) ?? { entregas: 0, total: 0 };
    cur.entregas += 1;
    cur.total = round2(cur.total + valor);
    porMesMap.set(mes, cur);
  }
  const porMes = [...porMesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, m]) => ({
      mes,
      mesLabel: formatMesReferencia(mes),
      entregas: m.entregas,
      total: m.total,
    }));
  const total = round2(porMes.reduce((s, m) => s + m.total, 0));
  if (total <= 0.005) return null;
  const meses = porMes.map((m) => m.mes);
  return {
    cooperadoId,
    cooperado: nome,
    meses,
    mesesLabel: formatMesesReferenciaRotulo(meses),
    entregas: porMes.reduce((s, m) => s + m.entregas, 0),
    total,
    porMes,
  };
}

function motorEmAbertoComNotasSemFicha(
  dataAberto: AppData,
  coopId: string,
  cooperadoId?: string
): LinhaPagarCooperadoEmAberto[] {
  const motor = getRelatorioPagarCooperadoEmAberto(dataAberto, coopId, cooperadoId);
  const ja = new Set(motor.map((l) => l.cooperadoId));
  const extras: LinhaPagarCooperadoEmAberto[] = [];
  for (const c of listCooperadosDaCooperativa(dataAberto, coopId)) {
    if (cooperadoId && c.id !== cooperadoId) continue;
    if (ja.has(c.id)) continue;
    const extra = linhaEmAbertoDeNotasSemFicha(dataAberto, c.id, coopId, c.nomeCompleto);
    if (extra) extras.push(extra);
  }
  return extras.length === 0 ? motor : [...motor, ...extras].sort((a, b) =>
    a.cooperado.localeCompare(b.cooperado, "pt-BR")
  );
}

/** Relatório «Em aberto» cacheado por revisão (evita recomputar a cada clique de aba). */
export function getRelatorioLancamentosEmAbertoResponsavel(
  data: AppData,
  coopId: string,
  cooperadoId?: string
): LinhaPagarCooperadoEmAberto[] {
  if (!coopId) return [];
  const dataAberto = appDataParaLeituraFichaEmAbertoResponsavel(data, coopId);
  if (cooperadoId) {
    return fundirLinhasEmAbertoEstavel(
      [],
      motorEmAbertoComNotasSemFicha(dataAberto, coopId, cooperadoId),
      dataAberto,
      coopId
    );
  }
  const revision = getDataRevision();
  const lastro = scoreSnapshotConferir(dataAberto);
  if (
    relatorioAbertoCache &&
    relatorioAbertoCache.revision === revision &&
    relatorioAbertoCache.coopId === coopId &&
    relatorioAbertoCache.pix === lastro.pix &&
    relatorioAbertoCache.fichas === lastro.fichas &&
    relatorioAbertoCache.notas === lastro.notas
  ) {
    return relatorioAbertoCache.linhas;
  }
  const motor = motorEmAbertoComNotasSemFicha(dataAberto, coopId);
  const anterior =
    motor.length === 0 &&
    relatorioAbertoLatch &&
    relatorioAbertoLatch.coopId === coopId
      ? relatorioAbertoLatch.linhas
      : [];
  const linhas = fundirLinhasEmAbertoEstavel(anterior, motor, dataAberto, coopId);
  relatorioAbertoLatch = { coopId, linhas };
  relatorioAbertoCache = {
    revision,
    coopId,
    pix: lastro.pix,
    fichas: lastro.fichas,
    notas: lastro.notas,
    linhas,
  };
  return linhas;
}

export function countCooperadosLancamentosEmAbertoResponsavel(data: AppData, coopId: string): number {
  return getRelatorioLancamentosEmAbertoResponsavel(data, coopId).length;
}

/** Invalida cache (testes). */
export function resetResponsavelPainelIndexCache(): void {
  painelCache = null;
  pagarProjCache = null;
  relatorioAbertoCache = null;
  relatorioAbertoLatch = null;
  conferirLeituraLatchByKey.clear();
  conferirLatchBuild = APP_BUILD_VERSION;
}
