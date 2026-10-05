/**
 * Etapa 18 P5 — aquece chunks pesados da rota Notas (responsável).
 */

export function prefetchStaffNotasPedidoUiChunks(): void {
  if (typeof window === "undefined") return;
  void import("@/components/notas/ResponsavelFilaCooperadosList");
  void import("@/components/notas/NotasPedidoHistoricoResponsavel");
}

export function prefetchStaffNotasHistoricoChunk(): void {
  if (typeof window === "undefined") return;
  void import("@/components/notas/NotasPedidoHistoricoResponsavel");
}

export function prefetchStaffNotasCorrecoesChunk(): void {
  if (typeof window === "undefined") return;
  void import("@/components/notas/CorrecoesEntregasPanel");
}

export function prefetchStaffNotasLancamentosAbertoChunk(): void {
  if (typeof window === "undefined") return;
  void import("@/components/notas/LancamentosEmAbertoPainel");
}

/** Chunk da rota Conferir — chamar ao abrir painel responsável ou prefetch /notas-pedido. */
export function prefetchStaffNotasPedidoRouteBundle(): void {
  if (typeof window === "undefined") return;
  prefetchStaffNotasPedidoUiChunks();
  void import("@/app/(app)/notas-pedido/NotasPedidoStaffMain");
}
