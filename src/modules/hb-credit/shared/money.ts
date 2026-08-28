/** Representação monetária exata — centavos inteiros (sem float no núcleo). */

export type MoneyCents = number & { readonly __brand: "MoneyCents" };

export const DEFAULT_CURRENCY = "BRL" as const;

export function assertMoneyCents(value: number): asserts value is MoneyCents {
  if (!Number.isInteger(value)) {
    throw new Error("Valor monetário deve ser inteiro (centavos).");
  }
}

export function toMoneyCents(value: number): MoneyCents {
  assertMoneyCents(value);
  if (value < 0) throw new Error("Centavos negativos inválidos para este tipo.");
  return value;
}

export function reaisToCents(reais: number): MoneyCents {
  if (!Number.isFinite(reais)) throw new Error("Valor em reais inválido.");
  const cents = Math.round(reais * 100);
  assertMoneyCents(cents);
  return cents;
}

export function centsToReais(cents: MoneyCents): number {
  return cents / 100;
}

export function formatCentsBRL(cents: MoneyCents | number): string {
  const n = typeof cents === "number" ? cents : cents;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n / 100);
}

/** Regra dos três valores: available = limit - used */
export function computeAvailableCents(limitReleased: MoneyCents, amountUsed: MoneyCents): MoneyCents {
  if (amountUsed > limitReleased) {
    throw new Error("Valor usado não pode exceder limite liberado.");
  }
  return toMoneyCents(limitReleased - amountUsed);
}

export function assertTresValores(limitReleased: MoneyCents, amountUsed: MoneyCents, available: MoneyCents): void {
  const expected = computeAvailableCents(limitReleased, amountUsed);
  if (expected !== available) {
    throw new Error("Invariante violada: available = limit_released - amount_used");
  }
}
