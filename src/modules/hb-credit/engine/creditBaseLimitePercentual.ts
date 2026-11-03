/** Percentual sobre crédito-base (centavos) — sem dependência de ficha/guard (evita ciclo de bundle). */
export function calcLimiteFromPercentual(creditoBaseCents: number, percentual: number): number {
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    throw new Error("Percentual inválido (use 0 a 100).");
  }
  const base = Math.max(0, creditoBaseCents);
  const basisPoints = Math.round(percentual * 100);
  if (Number.isSafeInteger(base) && Math.abs(percentual * 100 - basisPoints) < 0.000001) {
    // Mesma aritmética decimal da RPC: evita 45 × 70% virar 31,499999... centavos.
    return Number((BigInt(base) * BigInt(basisPoints) + BigInt(5000)) / BigInt(10000));
  }
  return Math.round(base * (percentual / 100));
}
