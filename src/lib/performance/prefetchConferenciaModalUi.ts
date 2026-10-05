/**
 * Etapa 4 P2/P3 — aquece chunks do modal conferir (foto, tabela, lightbox).
 */

export function prefetchConferenciaModalUiChunks(): void {
  if (typeof window === "undefined") return;
  void import("@/components/notas/NotasPedidoConferirItensTable");
  void import("@/components/notas/NotasPedidoConferirFotoPainel");
  void import("@/components/ui/FotoLightbox");
}
