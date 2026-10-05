/**
 * Etapa 4 P2 — aquece chunks do modal conferir (tabela de itens + lightbox).
 */

export function prefetchConferenciaModalUiChunks(): void {
  if (typeof window === "undefined") return;
  void import("@/components/notas/NotasPedidoConferirItensTable");
  void import("@/components/ui/FotoLightbox");
}
