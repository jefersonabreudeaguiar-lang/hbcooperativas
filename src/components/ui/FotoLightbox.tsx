"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { NotaFotoImg } from "@/components/ui/NotaFotoImg";
import { FOTO_ENTREGA_LIGHTBOX_IMG } from "@/components/notas/fotoEntregaDisplay";
import { cn } from "@/utils/format";

export type FotoLightboxItem = {
  src: string;
  alt: string;
};

interface FotoLightboxProps {
  open: boolean;
  items: FotoLightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

/** Visualização em tela cheia para fotos de entrega (mobile-first). */
export function FotoLightbox({ open, items, index, onClose, onIndexChange }: FotoLightboxProps) {
  const item = items[index];
  const hasMultiple = items.length > 1;

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const goPrev = useCallback(() => {
    if (!hasMultiple) return;
    onIndexChange((index - 1 + items.length) % items.length);
  }, [hasMultiple, index, items.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (!hasMultiple) return;
    onIndexChange((index + 1) % items.length);
  }, [hasMultiple, index, items.length, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, goPrev, goNext]);

  if (!open || !item || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={item.alt || "Foto ampliada"}
    >
      <header className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center w-11 h-11 rounded-full text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors"
          aria-label="Fechar"
        >
          <X size={24} />
        </button>
        {hasMultiple ? (
          <p className="text-sm font-medium text-white/80 tabular-nums">
            {index + 1} de {items.length}
          </p>
        ) : (
          <span className="w-11" aria-hidden />
        )}
        <span className="w-11" aria-hidden />
      </header>

      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-1 sm:px-4"
        onClick={onClose}
      >
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="hidden sm:inline-flex absolute left-2 z-10 items-center justify-center w-12 h-12 rounded-full bg-black/40 text-white hover:bg-black/60"
            aria-label="Foto anterior"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        <div
          className="w-full h-full max-h-[calc(100dvh-7rem)] flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <NotaFotoImg src={item.src} alt={item.alt} className={FOTO_ENTREGA_LIGHTBOX_IMG} />
        </div>

        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="hidden sm:inline-flex absolute right-2 z-10 items-center justify-center w-12 h-12 rounded-full bg-black/40 text-white hover:bg-black/60"
            aria-label="Próxima foto"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {hasMultiple && (
        <div
          className="shrink-0 flex sm:hidden items-center justify-center gap-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center gap-1 px-4 py-2.5 rounded-full bg-white/15 text-white text-sm font-medium active:bg-white/25"
          >
            <ChevronLeft size={20} /> Anterior
          </button>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1 px-4 py-2.5 rounded-full bg-white/15 text-white text-sm font-medium active:bg-white/25"
          >
            Próxima <ChevronRight size={20} />
          </button>
        </div>
      )}

      {!hasMultiple && (
        <p className="shrink-0 text-center text-white/50 text-xs pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4">
          Toque fora da imagem para fechar
        </p>
      )}
    </div>,
    document.body
  );
}

/** Botão de miniatura que abre o lightbox (acessível, área de toque confortável). */
export function FotoLightboxTrigger({
  src,
  alt,
  className,
  imgClassName,
  onOpen,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative block w-full text-left rounded-lg overflow-hidden",
        "ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600",
        "active:opacity-95 transition-opacity [-webkit-tap-highlight-color:transparent]",
        className
      )}
      aria-label={`Ampliar: ${alt}`}
    >
      <NotaFotoImg src={src} alt={alt} className={imgClassName} />
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-2 flex justify-end"
        aria-hidden
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/90 opacity-90 group-hover:opacity-100">
          Ampliar
        </span>
      </span>
    </button>
  );
}
