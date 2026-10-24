/**
 * Piloto mobile — somente Jeferson, uma aba por vez.
 * GA (todos os cooperados) permanece no build estável até A1–A6 = SIM e promoção explícita.
 */
import type { User } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";

export const COOPERADO_JEFERSON_PILOTO_FASES_VERSION = 1;

/** Ordem fixa de homologação. */
export type CooperadoJefersonPilotoAba =
  | "inicio"
  | "entregas"
  | "precos"
  | "financeiro"
  | "ciclo_abas"
  | "atualizar_valor";

export const COOPERADO_JEFERSON_PILOTO_ORDEM_ABAS: readonly CooperadoJefersonPilotoAba[] = [
  "inicio",
  "entregas",
  "precos",
  "financeiro",
  "ciclo_abas",
  "atualizar_valor",
];

const ORDEM: CooperadoJefersonPilotoAba[] = [...COOPERADO_JEFERSON_PILOTO_ORDEM_ABAS];

/**
 * Até o usuário confirmar cada etapa, só liberamos melhorias/código piloto na fase atual.
 * Fase 1 = só Início. Não avançar sem SIM do usuário em produção.
 */
export const COOPERADO_JEFERSON_PILOTO_FASE_LIBERADA: CooperadoJefersonPilotoAba = "inicio";

function indiceFase(aba: CooperadoJefersonPilotoAba): number {
  return ORDEM.indexOf(aba);
}

/** Jeferson + aba dentro da fase liberada (ou anterior já “congelada” no GA). */
export function cooperadoJefersonPilotoAbaAtiva(
  user: Omit<User, "password"> | null | undefined,
  aba: CooperadoJefersonPilotoAba
): boolean {
  if (!isCooperadoMobilePilot(user)) return false;
  const liberada = indiceFase(COOPERADO_JEFERSON_PILOTO_FASE_LIBERADA);
  const alvo = indiceFase(aba);
  if (liberada < 0 || alvo < 0) return false;
  return alvo <= liberada;
}

/** Qualquer código novo do piloto (diff) deve checar isto — demais cooperados nunca entram. */
export function cooperadoJefersonPilotoSessao(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoMobilePilot(user);
}

/** Promoção para todos os cooperados: só após A1–A6 SIM + bump desta constante em commit dedicado. */
export const COOPERADO_JEFERSON_PILOTO_PROMOVIDO_GA = false;
