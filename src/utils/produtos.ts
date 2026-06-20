/** Ordem de cadastro: primeiro lançado no topo, último lançado embaixo (perto do formulário). */
export function sortPorOrdemLancamento<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
