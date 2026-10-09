import {
  COOPERADO_BOTTOM_TAB_HREFS,
  type CooperadoBottomTabHref,
} from "@/lib/performance/cooperadoBottomTabRoutes";
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";
import { loadCooperadoNotasHeavyChunk } from "@/lib/performance/loadCooperadoNotasHeavyChunk";

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
      loadCooperadoNotasHeavyChunk();
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
/** Lote pós-login — não puxa o monólito de notas (2.2); Entregas aquece no pointerdown ou ao abrir a aba. */
export function prefetchCooperadoTabRouteChunks(): void {
  if (typeof window === "undefined") return;
  for (const href of COOPERADO_BOTTOM_TAB_HREFS) {
    if (href === "/notas-pedido") continue;
    warmCooperadoTabRouteChunk(href);
  }
  void import("@/app/(app)/mensalidades/MensalidadesContent");
}

/** Só a casca da rota (chunk leve) — prefetch Next sem o Main de ~5k linhas. */
export function warmCooperadoNotasRouteShell(): void {
  if (typeof window === "undefined") return;
  void import("@/app/(app)/notas-pedido/NotasPedidoContent");
}
