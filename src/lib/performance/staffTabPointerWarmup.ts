/**
 * Aquece chunks das abas mobile do responsável no pointerdown — paridade com cooperado/WhatsApp.
 */
import { deferAfterPointerHandler } from "@/lib/performance/deferMainThreadWork";
import { prefetchStaffNotasPedidoRouteBundle } from "@/lib/performance/prefetchStaffNotasPedidoUi";
import { isStaffBottomTabPath } from "@/lib/performance/staffBottomTabRoutes";

const warmed = new Set<string>();

function warmOnce(href: string, loader: () => void): void {
  if (warmed.has(href)) return;
  warmed.add(href);
  loader();
}

function warmStaffTab(href: string): void {
  if (!isStaffBottomTabPath(href) && href !== "/financeiro" && href !== "/relatorios") return;
  switch (href) {
    case "/dashboard":
      warmOnce(href, () => void import("@/app/(app)/dashboard/DashboardContent"));
      return;
    case "/notas-pedido":
      warmOnce(href, () => prefetchStaffNotasPedidoRouteBundle());
      return;
    case "/ficha-corrida":
      warmOnce(href, () => void import("@/app/(app)/ficha-corrida/FichaCorridaContent"));
      return;
    case "/livro-caixa":
      warmOnce(href, () => void import("@/app/(app)/livro-caixa/LivroCaixaContent"));
      return;
    case "/conta-coop":
      warmOnce(href, () => void import("@/app/(app)/conta-coop/ContaCoopContent"));
      return;
    case "/cooperados":
      warmOnce(href, () => void import("@/app/(app)/cooperados/CooperadosContent"));
      return;
    case "/comunicados":
      warmOnce(href, () => void import("@/app/(app)/comunicados/ComunicadosContent"));
      return;
    case "/relatorios":
      warmOnce(href, () => void import("@/app/(app)/relatorios/RelatoriosContent"));
      return;
    default:
      return;
  }
}

export function staffTabWarmOnPointerDown(href: string): void {
  if (typeof window === "undefined") return;
  deferAfterPointerHandler(() => warmStaffTab(href));
}
