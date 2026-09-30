/**
 * Classes únicas para fotos de entrega (Conferir entregas, lightbox, miniaturas).
 * Sempre object-contain + max-height — nunca object-cover neste fluxo.
 */

/** Painel escuro da foto no modal de conferência (mobile: não ocupa a tela inteira). */
export const FOTO_ENTREGA_CONFERENCIA_PANEL =
  "max-h-[min(40dvh,calc(100dvh-13rem))] lg:max-h-none shrink-0 lg:shrink lg:flex-1 lg:min-h-0";

/** Foto principal ao conferir / sequência de lançamento por foto. */
export const FOTO_ENTREGA_CONFERENCIA_IMG =
  "block w-auto h-auto max-w-full max-h-[min(38dvh,calc(100dvh-14rem))] lg:max-h-[min(70dvh,calc(100dvh-12rem))] object-contain object-center mx-auto";

/** Miniaturas na fila e listas. */
export const FOTO_ENTREGA_THUMB_IMG =
  "max-w-full max-h-full w-auto h-auto object-contain object-center";

/** Detalhes da entrega (modal view). */
export const FOTO_ENTREGA_VIEW_MODAL_IMG =
  "max-w-full max-h-[22rem] w-auto h-auto object-contain object-center";

/** Lightbox / tela cheia. */
export const FOTO_ENTREGA_LIGHTBOX_IMG =
  "max-w-full max-h-[calc(100dvh-7rem)] w-auto h-auto object-contain object-center select-none touch-manipulation";
