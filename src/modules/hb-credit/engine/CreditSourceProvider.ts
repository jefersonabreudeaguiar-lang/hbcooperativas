/**
 * Adaptador futuro: Ficha Corrida → sugestão de limite Conta Coop.
 * V1: desacoplado — não altera ficha nem entregas.
 */
import type { AppData } from "@/types";

export type CreditLimitSuggestion = {
  cooperadoId: string;
  suggestedLimitCents: number;
  source: "manual" | "ficha_corrida_future";
  memo: string;
};

export function suggestCreditLimitsFromDeliveries(_data: AppData): CreditLimitSuggestion[] {
  return [];
}
