/** Valores monetários em centavos — sem float. */

export type Cents = number;

export function reaisToCents(value: number | string): Cents {
  const normalized = String(value).trim().replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function centsToReais(cents: Cents): number {
  return cents / 100;
}

export function formatCentsBRL(cents: Cents, hidden = false): string {
  if (hidden) return "R$ ••••••";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centsToReais(cents));
}

export function assertNonNegativeCents(cents: Cents, label: string): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`${label}: valor inválido (${cents}).`);
  }
}
