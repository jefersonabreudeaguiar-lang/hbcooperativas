/** Modo fortaleza */

import type { FortressLevel } from "../types";
import { getLatestDefenseDna } from "../dna/DefenseDNA";

export function computeFortressLevel(healthScore: number, forced?: boolean): FortressLevel {
  if (forced) return "FORTRESS";
  const dna = getLatestDefenseDna();
  if (healthScore <= dna.thresholds.fortressFull) return "FORTRESS";
  if (healthScore <= dna.thresholds.fortressDefensive) return "DEFENSIVE";
  if (healthScore <= dna.thresholds.fortressElevated) return "ELEVATED";
  return "NORMAL";
}

export function fortressEffects(level: FortressLevel): string[] {
  switch (level) {
    case "NORMAL":
      return ["Observação padrão"];
    case "ELEVATED":
      return ["Observação aumentada", "Validações extras em auth"];
    case "DEFENSIVE":
      return ["Evidências preservadas", "Ops sensíveis limitadas (simulado)"];
    case "FORTRESS":
      return ["Circuit breaker ativo", "Monitoramento reforçado", "Human required para mutações"];
  }
}
