import {
  COOPERADO_BOTTOM_TAB_HREFS,
  type CooperadoBottomTabHref,
} from "@/lib/performance/cooperadoBottomTabRoutes";
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";

/** Um chunk de aba — usado no pointerdown/touchstart e prefetch de vizinhos. */
export function warmCooperadoTabRouteChunk(href: string): void {
  if (typeof window === "undefined") return;
  switch (href) {
    case "/ficha-corrida":
      warmupCooperadoFinanceiroTabChunk();
      return;
    case "/dashboard":
      void import("@/app/(app)/dashboard/DashboardContent");
      return;
    case "/notas-pedido":
      void import("@/app/(app)/notas-pedido/NotasPedidoCooperadoMain");
      return;
    case "/precos":
      void import("@/app/(app)/precos/PrecosContent");
      return;
    default:
      return;
  }
}

/** Aquece só as abas adjacentes no rodapé (idle após troca — menos trabalho que o lote completo). */
export function warmCooperadoAdjacentTabRouteChunks(activeHref: string): void {
  if (typeof window === "undefined") return;
  const idx = (COOPERADO_BOTTOM_TAB_HREFS as readonly string[]).indexOf(activeHref);
  if (idx < 0) return;
  const neighbors: CooperadoBottomTabHref[] = [];
  if (idx > 0) neighbors.push(COOPERADO_BOTTOM_TAB_HREFS[idx - 1]);
  if (idx < COOPERADO_BOTTOM_TAB_HREFS.length - 1) {
    neighbors.push(COOPERADO_BOTTOM_TAB_HREFS[idx + 1]);
  }
  for (const href of neighbors) warmCooperadoTabRouteChunk(href);
}

/**
 * RQL 8.6 P1 — aquece chunks das abas cooperado (além do prefetch de rotas Next).
 */
export function prefetchCooperadoTabRouteChunks(): void {
  if (typeof window === "undefined") return;
  for (const href of COOPERADO_BOTTOM_TAB_HREFS) {
    warmCooperadoTabRouteChunk(href);
  }
  void import("@/app/(app)/mensalidades/MensalidadesContent");
}
