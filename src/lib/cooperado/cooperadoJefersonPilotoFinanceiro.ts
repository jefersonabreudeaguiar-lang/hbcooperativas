/**
 * Fase 1 — Piloto financeiro mobile **somente Jeferson**.
 * Promover para todos: trocar `pilotoFinanceiroCooperado` para GA quando checklist fechar.
 */
import type { User } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";

export const COOPERADO_JEFERSON_PILOTO_FINANCEIRO_VERSION = 1;

/** Único gate de negócio do piloto Início + Financeiro unificado. */
export function cooperadoJefersonPilotoFinanceiroAtivo(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoMobilePilot(user);
}

/** Início sincronizado com aba Financeiro — só no piloto (não em todo GA). */
export function cooperadoInicioSincronizadoComFinanceiroPiloto(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  return cooperadoJefersonPilotoFinanceiroAtivo(user);
}
