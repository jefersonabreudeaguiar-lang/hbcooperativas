export function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

export function centsToReais(cents: number): number {
  return cents / 100;
}

export function formatCentsBRL(cents: number, hidden = false): string {
  if (hidden) return "R$ ••••";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centsToReais(cents));
}

export function assertTresValores(limite: number, usado: number): void {
  const disponivel = limite - usado;
  if (disponivel !== limite - usado || usado > limite || limite < 0 || usado < 0) {
    throw new Error("Invariante violada: limite = usado + disponível");
  }
}

export function computeDisponivel(limiteLiberadoCents: number, valorUsadoCents: number): number {
  return Math.max(0, limiteLiberadoCents - valorUsadoCents);
}
