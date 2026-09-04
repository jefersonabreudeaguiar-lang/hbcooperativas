import type {
  AppData,
  EscopoEleitoralVotacao,
  VotacaoOpcao,
  VotacaoPauta,
  VotacaoPautaStatus,
  VotacaoVoto,
} from "@/types";
import { getCooperadoNome } from "@/utils/calculations";
import {
  listCooperadosDaCooperativa,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";

const MS_24H = 24 * 60 * 60 * 1000;

export interface VotoCooperadoLinha {
  id: string;
  cooperadoId: string;
  cooperadoNome: string;
  voto: VotacaoOpcao;
  assinaturaDataUrl?: string;
  createdAt: string;
}

export interface ResumoVotacaoPauta {
  pauta: VotacaoPauta;
  totalElegiveis: number;
  totalVotos: number;
  votosSim: number;
  votosNao: number;
  votosAbstencao: number;
  pctSim: number;
  pctNao: number;
  pctAbstencao: number;
  todosVotaram: boolean;
  periodoEncerrado: boolean;
  podePublicarResultado: boolean;
  votos: VotoCooperadoLinha[];
  pendentes: { id: string; nome: string }[];
}

export interface RelatorioVotacaoPauta {
  pauta: VotacaoPauta;
  resumo: ResumoVotacaoPauta;
}

export interface RelatorioVotacoes {
  pautas: RelatorioVotacaoPauta[];
}

function startOfDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function endOfDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
}

export function getEscopoEleitoralPauta(pauta: VotacaoPauta): EscopoEleitoralVotacao {
  return pauta.escopoEleitoral === "diretoria" ? "diretoria" : "todos";
}

export function labelEscopoEleitoral(escopo: EscopoEleitoralVotacao): string {
  return escopo === "diretoria" ? "Somente diretoria" : "Todos os cooperados";
}

export function listCooperadosElegiveisPauta(
  data: AppData,
  cooperativaId: string,
  pauta: VotacaoPauta
) {
  const base = listCooperadosDaCooperativa(data, cooperativaId);
  if (getEscopoEleitoralPauta(pauta) === "diretoria") {
    return base.filter((c) => Boolean(c.membroDiretoria));
  }
  return base;
}

export function cooperadoElegivelVotacao(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  pauta: VotacaoPauta
): boolean {
  if (getEscopoEleitoralPauta(pauta) === "todos") return true;
  const elegiveis = listCooperadosElegiveisPauta(data, cooperativaId, pauta);
  const alvo = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  return elegiveis.some(
    (c) =>
      c.id === cooperadoId ||
      c.id === alvo ||
      resolverCooperadoIdCanonico(data, c.id, cooperativaId) === alvo
  );
}

export function labelVoto(voto: VotacaoOpcao): string {
  switch (voto) {
    case "sim":
      return "SIM";
    case "nao":
      return "NÃO";
    case "abstencao":
      return "ABSTENÇÃO";
    default:
      return voto;
  }
}

export function pautaNoPeriodo(pauta: VotacaoPauta, ref: Date = new Date()): boolean {
  const t = ref.getTime();
  return t >= startOfDay(pauta.inicioEm).getTime() && t <= endOfDay(pauta.fimEm).getTime();
}

export function pautaPeriodoEncerrado(pauta: VotacaoPauta, ref: Date = new Date()): boolean {
  return ref.getTime() > endOfDay(pauta.fimEm).getTime();
}

export function formatReuniaoWhatsapp(pauta: VotacaoPauta): string | null {
  if (!pauta.reuniaoWhatsapp?.trim()) return null;
  return pauta.reuniaoWhatsapp.trim();
}

export function formatHorarioReuniao(pauta: VotacaoPauta): string | null {
  const ini = pauta.reuniaoHorarioInicio?.trim();
  const fim = pauta.reuniaoHorarioFim?.trim();
  if (!ini && !fim) return null;
  if (ini && fim) return `${ini} às ${fim}`;
  return ini ?? fim ?? null;
}

export function listarPautasCooperativa(data: AppData, cooperativaId?: string): VotacaoPauta[] {
  let items = data.votacaoPautas ?? [];
  if (cooperativaId) items = items.filter((p) => p.cooperativaId === cooperativaId);
  return [...items].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
}

export function listarVotosPauta(data: AppData, pautaId: string, cooperativaId?: string): VotoCooperadoLinha[] {
  const pauta = cooperativaId
    ? getPautaById(data, pautaId, cooperativaId)
    : (data.votacaoPautas ?? []).find((p) => p.id === pautaId);
  const coopId = cooperativaId ?? pauta?.cooperativaId;
  const reabertoEm = pauta?.votosReabertosEm ? new Date(pauta.votosReabertosEm).getTime() : 0;

  const byCanon = new Map<string, VotoCooperadoLinha>();
  for (const v of data.votacaoVotos ?? []) {
    if (v.pautaId !== pautaId) continue;
    if (coopId && v.cooperativaId !== coopId) continue;
    if (reabertoEm && new Date(v.createdAt).getTime() < reabertoEm) continue;

    const cooperadoId = coopId
      ? resolverCooperadoIdCanonico(data, v.cooperadoId, coopId)
      : v.cooperadoId;
    const linha: VotoCooperadoLinha = {
      id: v.id,
      cooperadoId,
      cooperadoNome: v.cooperadoNome,
      voto: v.voto,
      assinaturaDataUrl: v.assinaturaDataUrl,
      createdAt: v.createdAt,
    };
    const prev = byCanon.get(cooperadoId);
    if (!prev || linha.createdAt.localeCompare(prev.createdAt) >= 0) {
      byCanon.set(cooperadoId, linha);
    }
  }

  return [...byCanon.values()].sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));
}

export function cooperadoJaVotou(
  data: AppData,
  pautaId: string,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  const pauta = cooperativaId
    ? getPautaById(data, pautaId, cooperativaId)
    : (data.votacaoPautas ?? []).find((p) => p.id === pautaId);
  const reabertoEm = pauta?.votosReabertosEm
    ? new Date(pauta.votosReabertosEm).getTime()
    : 0;

  return (data.votacaoVotos ?? []).some((v) => {
    if (v.pautaId !== pautaId || v.cooperadoId !== cooperadoId) return false;
    if (reabertoEm && new Date(v.createdAt).getTime() < reabertoEm) return false;
    if (reabertoEm && v.confirmadoNuvem !== true) return false;
    return true;
  });
}

export function getPautaById(
  data: AppData,
  pautaId: string,
  cooperativaId: string
): VotacaoPauta | null {
  return (
    (data.votacaoPautas ?? []).find((p) => p.id === pautaId && p.cooperativaId === cooperativaId) ?? null
  );
}

/** Pautas abertas no período em que o cooperado ainda não votou. */
export function listPautasAbertasCooperado(
  data: AppData,
  cooperativaId: string,
  cooperadoId: string,
  ref: Date = new Date()
): VotacaoPauta[] {
  return listarPautasCooperativa(data, cooperativaId).filter(
    (p) =>
      p.status === "aberta" &&
      pautaNoPeriodo(p, ref) &&
      cooperadoElegivelVotacao(data, cooperadoId, cooperativaId, p) &&
      !cooperadoJaVotou(data, p.id, cooperadoId, cooperativaId)
  );
}

/** Primeira pauta aberta pendente (compatibilidade). */
export function getPautaAtivaCooperado(
  data: AppData,
  cooperativaId: string,
  cooperadoId: string,
  ref: Date = new Date()
): VotacaoPauta | null {
  return listPautasAbertasCooperado(data, cooperativaId, cooperadoId, ref)[0] ?? null;
}

export function getPautaVotacaoCooperado(
  data: AppData,
  pautaId: string,
  cooperativaId: string,
  cooperadoId: string,
  ref: Date = new Date()
): { pauta: VotacaoPauta; jaVotou: boolean } | null {
  const pauta = getPautaById(data, pautaId, cooperativaId);
  if (!pauta || pauta.status !== "aberta" || !pautaNoPeriodo(pauta, ref)) return null;
  if (!cooperadoElegivelVotacao(data, cooperadoId, cooperativaId, pauta)) return null;
  return { pauta, jaVotou: cooperadoJaVotou(data, pautaId, cooperadoId, cooperativaId) };
}

export function resultadoVisivelCooperado(
  data: AppData,
  cooperativaId: string,
  ref: Date = new Date()
): { pauta: VotacaoPauta; resumo: ResumoVotacaoPauta } | null {
  const candidatas = listarPautasCooperativa(data, cooperativaId)
    .filter((p) => p.status === "resultado_publicado" && p.resultadoPublicadoEm)
    .filter((p) => {
      const publicado = new Date(p.resultadoPublicadoEm!).getTime();
      return ref.getTime() - publicado <= MS_24H;
    })
    .sort((a, b) => (b.resultadoPublicadoEm ?? "").localeCompare(a.resultadoPublicadoEm ?? ""));

  const pauta = candidatas[0];
  if (!pauta) return null;
  return { pauta, resumo: getResumoPauta(data, pauta.id, cooperativaId) };
}

/** Detalhe do resultado publicado — só dentro das 24 h após publicação. */
export function resultadoCooperadoVisivelPorPauta(
  data: AppData,
  pautaId: string,
  cooperativaId: string,
  ref: Date = new Date()
): { pauta: VotacaoPauta; resumo: ResumoVotacaoPauta } | null {
  const pauta = (data.votacaoPautas ?? []).find(
    (p) => p.id === pautaId && p.cooperativaId === cooperativaId
  );
  if (!pauta || pauta.status !== "resultado_publicado" || !pauta.resultadoPublicadoEm) {
    return null;
  }
  const publicado = new Date(pauta.resultadoPublicadoEm).getTime();
  if (ref.getTime() - publicado > MS_24H) return null;
  return { pauta, resumo: getResumoPauta(data, pautaId, cooperativaId) };
}

export function horasRestantesResultadoPublicado(
  resultadoPublicadoEm: string,
  ref: Date = new Date()
): number {
  const fim = new Date(resultadoPublicadoEm).getTime() + MS_24H;
  return Math.max(0, Math.ceil((fim - ref.getTime()) / (60 * 60 * 1000)));
}

export function getResumoPauta(
  data: AppData,
  pautaId: string,
  cooperativaId?: string
): ResumoVotacaoPauta {
  const pauta = (data.votacaoPautas ?? []).find((p) => p.id === pautaId);
  if (!pauta) {
    throw new Error("Pauta não encontrada.");
  }
  const coopId = cooperativaId ?? pauta.cooperativaId;
  const elegiveis = listCooperadosElegiveisPauta(data, coopId, pauta);
  const votos = listarVotosPauta(data, pautaId, coopId);
  const votosSim = votos.filter((v) => v.voto === "sim").length;
  const votosNao = votos.filter((v) => v.voto === "nao").length;
  const votosAbstencao = votos.filter((v) => v.voto === "abstencao").length;
  const totalVotos = votos.length;
  const totalElegiveis = elegiveis.length;
  const pct = (n: number) => (totalVotos > 0 ? Math.round((n / totalVotos) * 1000) / 10 : 0);
  const votouIds = new Set(
    votos.map((v) =>
      coopId ? resolverCooperadoIdCanonico(data, v.cooperadoId, coopId) : v.cooperadoId
    )
  );
  const pendentes = elegiveis
    .filter((c) => !votouIds.has(resolverCooperadoIdCanonico(data, c.id, coopId)))
    .map((c) => ({ id: c.id, nome: c.nomeCompleto }));
  const todosVotaram = totalElegiveis > 0 && totalVotos >= totalElegiveis;
  const periodoEncerrado = pautaPeriodoEncerrado(pauta);

  return {
    pauta,
    totalElegiveis,
    totalVotos,
    votosSim,
    votosNao,
    votosAbstencao,
    pctSim: pct(votosSim),
    pctNao: pct(votosNao),
    pctAbstencao: pct(votosAbstencao),
    todosVotaram,
    periodoEncerrado,
    podePublicarResultado:
      pauta.status === "aberta" && (todosVotaram || periodoEncerrado) && totalVotos > 0,
    votos,
    pendentes,
  };
}

export function getRelatorioVotacoes(data: AppData, cooperativaId?: string): RelatorioVotacoes {
  const pautas = listarPautasCooperativa(data, cooperativaId).filter((p) => p.status !== "rascunho");
  return {
    pautas: pautas.map((pauta) => ({
      pauta,
      resumo: getResumoPauta(data, pauta.id, cooperativaId),
    })),
  };
}

export function labelStatusPauta(status: VotacaoPautaStatus): string {
  switch (status) {
    case "rascunho":
      return "Rascunho";
    case "aberta":
      return "Enquete aberta";
    case "encerrada":
      return "Encerrada";
    case "resultado_publicado":
      return "Resultado publicado";
    default:
      return status;
  }
}

export function criarPautaVotacao(
  data: AppData,
  payload: {
    cooperativaId: string;
    texto: string;
    inicioEm: string;
    fimEm: string;
    observacao?: string;
    reuniaoWhatsapp?: string;
    reuniaoHorarioInicio?: string;
    reuniaoHorarioFim?: string;
    escopoEleitoral?: EscopoEleitoralVotacao;
    criadoPorUserId?: string;
    criadoPorNome?: string;
  }
): { ok: true; data: AppData; pauta: VotacaoPauta } | { ok: false; error: string } {
  const texto = payload.texto.trim();
  if (!texto) return { ok: false, error: "Descreva a pauta da votação." };
  if (!payload.inicioEm || !payload.fimEm) return { ok: false, error: "Informe início e fim da votação." };
  if (startOfDay(payload.fimEm).getTime() < startOfDay(payload.inicioEm).getTime()) {
    return { ok: false, error: "A data de fim deve ser igual ou posterior ao início." };
  }

  const now = new Date().toISOString();
  const pauta: VotacaoPauta = {
    id: `vtp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    cooperativaId: payload.cooperativaId,
    texto,
    inicioEm: payload.inicioEm,
    fimEm: payload.fimEm,
    observacao: payload.observacao?.trim() || undefined,
    reuniaoWhatsapp: payload.reuniaoWhatsapp?.trim() || undefined,
    reuniaoHorarioInicio: payload.reuniaoHorarioInicio?.trim() || undefined,
    reuniaoHorarioFim: payload.reuniaoHorarioFim?.trim() || undefined,
    escopoEleitoral: payload.escopoEleitoral === "diretoria" ? "diretoria" : "todos",
    status: "rascunho",
    criadoPorUserId: payload.criadoPorUserId,
    criadoPorNome: payload.criadoPorNome,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ok: true,
    pauta,
    data: { ...data, votacaoPautas: [...(data.votacaoPautas ?? []), pauta] },
  };
}

export function abrirPautaVotacao(
  data: AppData,
  pautaId: string,
  cooperativaId: string
): { ok: true; data: AppData } | { ok: false; error: string } {
  const pauta = (data.votacaoPautas ?? []).find((p) => p.id === pautaId && p.cooperativaId === cooperativaId);
  if (!pauta) return { ok: false, error: "Pauta não encontrada." };
  if (pauta.status !== "rascunho") return { ok: false, error: "Esta pauta já foi lançada." };

  const aberta = (data.votacaoPautas ?? []).some(
    (p) => p.cooperativaId === cooperativaId && p.status === "aberta"
  );
  if (aberta) {
    return { ok: false, error: "Já existe uma enquete aberta. Encerre ou publique o resultado antes de lançar outra." };
  }

  const now = new Date().toISOString();
  const next = (data.votacaoPautas ?? []).map((p) =>
    p.id === pautaId
      ? { ...p, status: "aberta" as const, abertaEm: now, updatedAt: now }
      : p
  );
  return { ok: true, data: { ...data, votacaoPautas: next } };
}

export function publicarResultadoPauta(
  data: AppData,
  pautaId: string,
  cooperativaId: string
): { ok: true; data: AppData } | { ok: false; error: string } {
  const resumo = getResumoPauta(data, pautaId, cooperativaId);
  if (resumo.pauta.status !== "aberta") {
    return { ok: false, error: "Só é possível publicar resultado de enquetes abertas." };
  }
  if (!resumo.podePublicarResultado) {
    return {
      ok: false,
      error: "Aguarde todos votarem ou o fim do prazo, com pelo menos um voto registrado.",
    };
  }

  const now = new Date().toISOString();
  const next = (data.votacaoPautas ?? []).map((p) =>
    p.id === pautaId
      ? { ...p, status: "resultado_publicado" as const, resultadoPublicadoEm: now, updatedAt: now }
      : p
  );
  return { ok: true, data: { ...data, votacaoPautas: next } };
}

export function removerVotoCooperadoPauta(
  data: AppData,
  pautaId: string,
  cooperadoId: string,
  cooperativaId: string
): AppData {
  return {
    ...data,
    votacaoVotos: (data.votacaoVotos ?? []).filter(
      (v) =>
        !(
          v.pautaId === pautaId &&
          v.cooperadoId === cooperadoId &&
          v.cooperativaId === cooperativaId
        )
    ),
  };
}

export function confirmarVotoCooperadoNuvem(
  data: AppData,
  pautaId: string,
  cooperadoId: string,
  cooperativaId: string
): AppData {
  return {
    ...data,
    votacaoVotos: (data.votacaoVotos ?? []).map((v) =>
      v.pautaId === pautaId && v.cooperadoId === cooperadoId && v.cooperativaId === cooperativaId
        ? { ...v, confirmadoNuvem: true }
        : v
    ),
  };
}

export function registrarVotoCooperado(
  data: AppData,
  payload: {
    pautaId: string;
    cooperativaId: string;
    cooperadoId: string;
    voto: VotacaoOpcao;
    assinaturaDataUrl: string;
  }
): { ok: true; data: AppData } | { ok: false; error: string } {
  const pauta = (data.votacaoPautas ?? []).find(
    (p) => p.id === payload.pautaId && p.cooperativaId === payload.cooperativaId
  );
  if (!pauta) return { ok: false, error: "Enquete não encontrada." };
  if (pauta.status !== "aberta") return { ok: false, error: "Esta enquete não está aberta." };
  if (!pautaNoPeriodo(pauta)) return { ok: false, error: "Fora do período de votação." };
  if (!cooperadoElegivelVotacao(data, payload.cooperadoId, payload.cooperativaId, pauta)) {
    return { ok: false, error: "Esta votação é restrita aos membros da diretoria." };
  }
  if (cooperadoJaVotou(data, payload.pautaId, payload.cooperadoId, payload.cooperativaId)) {
    return { ok: false, error: "Você já registrou seu voto nesta pauta." };
  }
  if (!payload.assinaturaDataUrl?.trim()) {
    return { ok: false, error: "Assine no campo indicado antes de enviar o voto." };
  }

  const now = new Date().toISOString();
  const voto: VotacaoVoto = {
    id: `vtv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    pautaId: payload.pautaId,
    cooperativaId: payload.cooperativaId,
    cooperadoId: payload.cooperadoId,
    cooperadoNome: getCooperadoNome(data.cooperados, payload.cooperadoId),
    voto: payload.voto,
    assinaturaDataUrl: payload.assinaturaDataUrl.trim(),
    createdAt: now,
  };

  const votosSemDuplicata = (data.votacaoVotos ?? []).filter(
    (v) => !(v.pautaId === payload.pautaId && v.cooperadoId === payload.cooperadoId)
  );

  return {
    ok: true,
    data: { ...data, votacaoVotos: [...votosSemDuplicata, voto] },
  };
}

export function removerPautaRascunho(
  data: AppData,
  pautaId: string,
  cooperativaId: string
): { ok: true; data: AppData } | { ok: false; error: string } {
  const pauta = (data.votacaoPautas ?? []).find((p) => p.id === pautaId && p.cooperativaId === cooperativaId);
  if (!pauta) return { ok: false, error: "Pauta não encontrada." };
  if (pauta.status !== "rascunho") return { ok: false, error: "Só rascunhos podem ser excluídos." };
  return {
    ok: true,
    data: {
      ...data,
      votacaoPautas: (data.votacaoPautas ?? []).filter((p) => p.id !== pautaId),
    },
  };
}
