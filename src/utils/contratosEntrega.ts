import type { AppData, Instituicao } from "@/types";
import { generateId } from "@/services/dataStore";
import {
  getContratosEntregaValidos,
  contratoValidoNoCatalogo,
} from "@/services/catalogoContratosService";
import { getInstituicaoPadraoId } from "@/utils/instituicaoPreferida";

export const CONTRATO_PNAE_PADRAO_NOME = "PNAE - MERENDA ESCOLAR";

/** Contratos válidos para envio de entrega — espelha o catálogo publicado pelo responsável. */
export function getContratosEntrega(data: AppData, cooperativaId: string): Instituicao[] {
  return getContratosEntregaValidos(data, cooperativaId);
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
  options?: { criarPadraoSeVazio?: boolean }
): { data: AppData; instituicaoId: string; criou: boolean } {
  const criarPadrao = options?.criarPadraoSeVazio !== false;
  let working = data;
  let criou = false;

  let contratos = getContratosEntregaValidos(working, cooperativaId);
  if (contratos.length === 0 && criarPadrao) {
    const ensured = ensureContratoPnaePadrao(working, cooperativaId);
    working = ensured.data;
    criou = ensured.criou;
    contratos = getContratosEntregaValidos(working, cooperativaId);
  }

  if (contratos.length === 0) {
    return { data: working, instituicaoId: "", criou };
  }

  const padrao = getInstituicaoPadraoId(cooperativaId);

  const pick = (id?: string) =>
    id && contratoValidoNoCatalogo(working, id, cooperativaId) ? id : undefined;

  const instituicaoId =
    pick(preferId) ??
    pick(padrao ?? undefined) ??
    contratos.find((c) => c.tipo === "PNAE")?.id ??
    contratos[0]?.id ??
    "";

  return { data: working, instituicaoId, criou };
}
