import type { AppData, VotacaoPauta, VotacaoPautaStatus, VotacaoVoto } from "@/types";
import { getCooperadoNome } from "@/utils/calculations";
import { listCooperadosDaCooperativa } from "@/services/cooperadoCloudService";

const MS_24H = 24 * 60 * 60 * 1000;

export interface VotoCooperadoLinha {
  id: string;
  cooperadoId: string;
  cooperadoNome: string;
  voto: "sim" | "nao";
  createdAt: string;
}

export interface ResumoVotacaoPauta {
  pauta: VotacaoPauta;
  totalElegiveis: number;
  totalVotos: number;
  votosSim: number;
  votosNao: number;
  pctSim: number;
  pctNao: number;
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

export function pautaNoPeriodo(pauta: VotacaoPauta, ref: Date = new Date()): boolean {
  const t = ref.getTime();
  return t >= startOfDay(pauta.inicioEm).getTime() && t <= endOfDay(pauta.fimEm).getTime();
}

export function pautaPeriodoEncerrado(pauta: VotacaoPauta, ref: Date = new Date()): boolean {
  return ref.getTime() > endOfDay(pauta.fimEm).getTime();
}

export function listarPautasCooperativa(data: AppData, cooperativaId?: string): VotacaoPauta[] {
  let items = data.votacaoPautas ?? [];
  if (cooperativaId) items = items.filter((p) => p.cooperativaId === cooperativaId);
  return [...items].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
}

export function listarVotosPauta(data: AppData, pautaId: string, cooperativaId?: string): VotoCooperadoLinha[] {
  return (data.votacaoVotos ?? [])
    .filter((v) => v.pautaId === pautaId && (!cooperativaId || v.cooperativaId === cooperativaId))
    .map((v) => ({
      id: v.id,
      cooperadoId: v.cooperadoId,
      cooperadoNome: v.cooperadoNome,
      voto: v.voto,
      createdAt: v.createdAt,
    }))
    .sort((a, b) => a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));
}

export function cooperadoJaVotou(data: AppData, pautaId: string, cooperadoId: string): boolean {
  return (data.votacaoVotos ?? []).some((v) => v.pautaId === pautaId && v.cooperadoId === cooperadoId);
}

export function getPautaAtivaCooperado(
  data: AppData,
  cooperativaId: string,
  cooperadoId: string,
  ref: Date = new Date()
): VotacaoPauta | null {
  const pautas = listarPautasCooperativa(data, cooperativaId).filter(
    (p) => p.status === "aberta" && pautaNoPeriodo(p, ref) && !cooperadoJaVotou(data, p.id, cooperadoId)
  );
  return pautas[0] ?? null;
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
  const elegiveis = listCooperadosDaCooperativa(data, coopId);
  const votos = listarVotosPauta(data, pautaId, coopId);
  const votosSim = votos.filter((v) => v.voto === "sim").length;
  const votosNao = votos.filter((v) => v.voto === "nao").length;
  const totalVotos = votos.length;
  const totalElegiveis = elegiveis.length;
  const pctSim = totalVotos > 0 ? Math.round((votosSim / totalVotos) * 1000) / 10 : 0;
  const pctNao = totalVotos > 0 ? Math.round((votosNao / totalVotos) * 1000) / 10 : 0;
  const votouIds = new Set(votos.map((v) => v.cooperadoId));
  const pendentes = elegiveis
    .filter((c) => !votouIds.has(c.id))
    .map((c) => ({ id: c.id, nome: c.nomeCompleto }));
  const todosVotaram = totalElegiveis > 0 && totalVotos >= totalElegiveis;
  const periodoEncerrado = pautaPeriodoEncerrado(pauta);

  return {
    pauta,
    totalElegiveis,
    totalVotos,
    votosSim,
    votosNao,
    pctSim,
    pctNao,
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

export function registrarVotoCooperado(
  data: AppData,
  payload: {
    pautaId: string;
    cooperativaId: string;
    cooperadoId: string;
    voto: "sim" | "nao";
  }
): { ok: true; data: AppData } | { ok: false; error: string } {
  const pauta = (data.votacaoPautas ?? []).find(
    (p) => p.id === payload.pautaId && p.cooperativaId === payload.cooperativaId
  );
  if (!pauta) return { ok: false, error: "Enquete não encontrada." };
  if (pauta.status !== "aberta") return { ok: false, error: "Esta enquete não está aberta." };
  if (!pautaNoPeriodo(pauta)) return { ok: false, error: "Fora do período de votação." };
  if (cooperadoJaVotou(data, payload.pautaId, payload.cooperadoId)) {
    return { ok: false, error: "Você já registrou seu voto nesta pauta." };
  }

  const now = new Date().toISOString();
  const voto: VotacaoVoto = {
    id: `vtv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    pautaId: payload.pautaId,
    cooperativaId: payload.cooperativaId,
    cooperadoId: payload.cooperadoId,
    cooperadoNome: getCooperadoNome(data.cooperados, payload.cooperadoId),
    voto: payload.voto,
    createdAt: now,
  };

  return {
    ok: true,
    data: { ...data, votacaoVotos: [...(data.votacaoVotos ?? []), voto] },
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
