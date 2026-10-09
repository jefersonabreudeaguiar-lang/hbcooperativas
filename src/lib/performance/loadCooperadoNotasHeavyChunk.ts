/**
 * Onda 2.2 — monólito cooperado de notas: só baixar no toque na aba ou ao abrir a rota.
 * Não incluir no prefetch em lote pós-login (Início/Financeiro ficam mais leves).
 */
export function loadCooperadoNotasHeavyChunk(): void {
  if (typeof window === "undefined") return;
  void import("@/app/(app)/notas-pedido/NotasPedidoCooperadoMain");
}
