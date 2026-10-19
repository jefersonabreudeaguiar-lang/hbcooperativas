import type { AppData, Instituicao } from "@/types";
import { generateId } from "@/services/dataStore";
import {
  getContratosEntregaValidos,
  getInstituicoesCatalogo,
  contratoValidoNoCatalogo,
} from "@/services/catalogoContratosService";
import { getInstituicaoPadraoId } from "@/utils/instituicaoPreferida";

export const CONTRATO_PNAE_PADRAO_NOME = "PNAE - MERENDA ESCOLAR";

/** Contratos válidos para envio de entrega — espelha o catálogo publicado pelo responsável. */
export function getContratosEntrega(data: AppData, cooperativaId: string): Instituicao[] {
  return getContratosEntregaValidos(data, cooperativaId);
}

/**
 * Cooperado: preços podem ainda não ter chegado; instituições publicadas já bastam para enviar foto.
 * Sem catálogo local, devolve vazio — o envio usa preferência/última nota.
 */
export function listarContratosParaEnvioCooperado(
  data: AppData,
  cooperativaId: string
): Instituicao[] {
  const validos = getContratosEntregaValidos(data, cooperativaId);
  if (validos.length > 0) return validos;
  return getInstituicoesCatalogo(data, cooperativaId);
}

function instituicaoIdRecenteNasNotas(data: AppData, cooperativaId: string): string | undefined {
  let bestId = "";
  let bestTs = 0;
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId && n.cooperativaId !== cooperativaId) continue;
    const id = n.instituicaoId?.trim();
    if (!id) continue;
    const ts = Date.parse(n.updatedAt || n.createdAt || "") || 0;
    if (ts >= bestTs) {
      bestTs = ts;
      bestId = id;
    }
  }
  return bestId || undefined;
}

export function getContratoLabel(inst: Instituicao): string {
  if (inst.tipo === "PNAE") {
    return inst.nome.toUpperCase().includes("PNAE") ? inst.nome : `Contrato ${inst.nome}`;
  }
  return inst.nome;
}

/** Garante ao menos o contrato PNAE padrão (somente responsável / cadastro inicial). */
export function ensureContratoPnaePadrao(data: AppData, cooperativaId: string): {
  data: AppData;
  instituicaoId: string;
  criou: boolean;
} {
  const contratos = getContratosEntregaValidos(data, cooperativaId);
  if (contratos.length > 0) {
    const pnae = contratos.find((i) => i.tipo === "PNAE") ?? contratos[0];
    return { data, instituicaoId: pnae.id, criou: false };
  }

  const now = new Date().toISOString();
  const nova: Instituicao = {
    id: generateId("i"),
    cooperativaId,
    nome: CONTRATO_PNAE_PADRAO_NOME,
    tipo: "PNAE",
    cnpj: "",
    responsavel: "",
    telefone: "",
    endereco: "",
    localEntrega: "Merenda escolar — PNAE",
    totalComprado: 0,
    createdAt: now,
    updatedAt: now,
  };

  return {
    data: { ...data, instituicoes: [...data.instituicoes, nova] },
    instituicaoId: nova.id,
    criou: true,
  };
}

/** Escolhe o contrato da entrega entre os publicados e válidos na nuvem. */
export function resolverContratoEntrega(
  data: AppData,
  cooperativaId: string,
  preferId?: string,
  options?: { criarPadraoSeVazio?: boolean; aceitarPreferenciaSemCatalogo?: boolean }
): { data: AppData; instituicaoId: string; criou: boolean } {
  const criarPadrao = options?.criarPadraoSeVazio !== false;
  const aceitarFora = options?.aceitarPreferenciaSemCatalogo === true;
  let working = data;
  let criou = false;

  let contratos = getContratosEntregaValidos(working, cooperativaId);
  if (contratos.length === 0 && criarPadrao) {
    const ensured = ensureContratoPnaePadrao(working, cooperativaId);
    working = ensured.data;
    criou = ensured.criou;
    contratos = getContratosEntregaValidos(working, cooperativaId);
  }

  const padrao = getInstituicaoPadraoId(cooperativaId);
  const catalogo = contratos.length > 0 ? contratos : getInstituicoesCatalogo(working, cooperativaId);

  const pickNoCatalogo = (id?: string) => (id?.trim() ? id.trim() : undefined);
  const pick = (id?: string) => {
    if (!id) return undefined;
    if (contratoValidoNoCatalogo(working, id, cooperativaId)) return id;
    if (catalogo.some((c) => c.id === id)) return id;
    if (aceitarFora) return pickNoCatalogo(id);
    return undefined;
  };

  const instituicaoId =
    pick(preferId) ??
    pick(padrao ?? undefined) ??
    catalogo.find((c) => c.tipo === "PNAE")?.id ??
    catalogo[0]?.id ??
    (aceitarFora ? instituicaoIdRecenteNasNotas(working, cooperativaId) : undefined) ??
    "";

  return { data: working, instituicaoId, criou };
}
