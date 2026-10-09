/**
 * Aquece o chunk da aba no toque — troca de aba mais rápida (estilo app de mensagem).
 * Não altera dados, sync ou telas financeiras.
 */
import { warmCooperadoTabRouteChunk } from "@/lib/performance/prefetchCooperadoTabRouteChunks";

const warmed = new Set<string>();

function warmCooperadoTab(href: string): void {
  if (warmed.has(href)) {
    warmCooperadoTabRouteChunk(href);
    return;
  }
  warmed.add(href);
  warmCooperadoTabRouteChunk(href);
}

/** touchstart no mobile dispara antes do pointerdown — começa o download do chunk mais cedo. */
export function cooperadoTabWarmOnTouchStart(href: string): void {
  if (typeof window === "undefined") return;
  warmCooperadoTab(href);
}

/** Prefetch de JS da rota alvo no pointerdown (fallback desktop / após touch). */
export function cooperadoTabWarmOnPointerDown(href: string): void {
  if (typeof window === "undefined") return;
  warmCooperadoTab(href);
}
