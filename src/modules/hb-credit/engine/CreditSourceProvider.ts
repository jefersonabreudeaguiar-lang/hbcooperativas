/**
 * Adaptador: Ficha Corrida → base de crédito Conta Coop.
 */
import type { AppData } from "@/types";
import { buildCreditosBaseMap } from "./creditBaseFromFicha";

export type CreditLimitSuggestion = {
  cooperadoId: string;
  suggestedLimitCents: number;
  source: "manual" | "ficha_corrida";
  memo: string;
};

export function suggestCreditLimitsFromDeliveries(
  data: AppData,
  percentual: number,
  cooperadoIds: string[],
  cooperativaId?: string
): CreditLimitSuggestion[] {
  const bases = buildCreditosBaseMap(data, cooperadoIds, cooperativaId);
  return cooperadoIds.map((cooperadoId) => {
    const creditoBaseCents = bases[cooperadoId] ?? 0;
    const suggestedLimitCents = Math.round(creditoBaseCents * (percentual / 100));
    return {
      cooperadoId,
      suggestedLimitCents,
      source: "ficha_corrida",
      memo: `${percentual}% do valor das entregas pendentes de pagamento ao cooperado`,
    };
  });
}
