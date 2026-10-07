/**
 * Chunk webpack dedicado — UI pesada do modal Conferir (fila do responsável).
 * Chamado no hover da fila e antes de abrir conferência.
 */
export function loadStaffNotasConferirChunk(): void {
  if (typeof window === "undefined") return;
  void Promise.all([
    import("@/components/notas/NotasPedidoConferirItensTable"),
    import("@/components/notas/NotasPedidoConferirFotoPainel"),
    import("@/components/ui/FotoLightbox"),
    import("@/lib/performance/loadConferenciaFotoPrefetch"),
    import("@/lib/performance/prefetchConferenciaModalUi"),
  ]);
}
