import type { AppData, Instituicao } from "@/types";
import { generateId } from "@/services/dataStore";
import { getInstituicaoPadraoId } from "@/utils/instituicaoPreferida";
import { idsInstituicoesExcluidas } from "@/services/instituicaoContratoService";

export const CONTRATO_PNAE_PADRAO_NOME = "PNAE - MERENDA ESCOLAR";

export function getContratosEntrega(data: AppData, cooperativaId: string): Instituicao[] {
  const excluidas = idsInstituicoesExcluidas(data, cooperativaId);
  return data.instituicoes.filter((i) => i.cooperativaId === cooperativaId && !excluidas.has(i.id));
}

export function getContratoLabel(inst: Instituicao): string {
  if (inst.tipo === "PNAE") {
    return inst.nome.toUpperCase().includes("PNAE") ? inst.nome : `Contrato ${inst.nome}`;
  }
  return inst.nome;
}

/** Garante ao menos o contrato PNAE padrão para o cooperado enviar entregas. */
export function ensureContratoPnaePadrao(data: AppData, cooperativaId: string): {
  data: AppData;
  instituicaoId: string;
  criou: boolean;
} {
  const contratos = getContratosEntrega(data, cooperativaId);
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

/** Escolhe o contrato da entrega: nota rejeitada → padrão salvo → PNAE → primeiro da lista → cria PNAE. */
export function resolverContratoEntrega(
  data: AppData,
  cooperativaId: string,
  preferId?: string
): { data: AppData; instituicaoId: string; criou: boolean } {
  const ensured = ensureContratoPnaePadrao(data, cooperativaId);
  const contratos = getContratosEntrega(ensured.data, cooperativaId);
  const padrao = getInstituicaoPadraoId(cooperativaId);

  const pick = (id?: string) =>
    id && contratos.some((c) => c.id === id) ? id : undefined;

  const instituicaoId =
    pick(preferId) ??
    pick(padrao ?? undefined) ??
    contratos.find((c) => c.tipo === "PNAE")?.id ??
    contratos[0]?.id ??
    ensured.instituicaoId;

  return { ...ensured, instituicaoId };
}
