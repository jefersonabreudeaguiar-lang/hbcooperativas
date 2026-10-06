/**
 * Etapa 18 P5 — aquece chunks pesados da rota Notas (responsável).
 */

let staffNotasRouteBundlePrefetchStarted = false;

function prefetchStaffConferenciaModalChunks(): void {
  if (typeof window === "undefined") return;
  void import("@/lib/performance/prefetchConferenciaModalUi").then((m) =>
    m.prefetchConferenciaModalUiChunks()
  );
  void import("@/lib/performance/loadConferenciaFotoPrefetch").then((m) =>
    m.prefetchConferenciaFotoPrefetchModule()
  );
}

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
  if (staffNotasRouteBundlePrefetchStarted) return;
  staffNotasRouteBundlePrefetchStarted = true;
  prefetchStaffNotasPedidoUiChunks();
  prefetchStaffConferenciaModalChunks();
  void import("@/app/(app)/notas-pedido/NotasPedidoStaffMain");
}
