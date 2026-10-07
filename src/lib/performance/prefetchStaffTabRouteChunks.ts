/**
 * Aquece chunks das rotas mobile da gestão (barra inferior + atalhos frequentes).
 */
import { prefetchStaffNotasPedidoRouteBundle } from "@/lib/performance/prefetchStaffNotasPedidoUi";

export function prefetchStaffTabRouteChunks(): void {
  if (typeof window === "undefined") return;
  prefetchStaffNotasPedidoRouteBundle();
  void import("@/app/(app)/dashboard/DashboardContent");
  void import("@/app/(app)/ficha-corrida/FichaCorridaContent");
  void import("@/app/(app)/livro-caixa/LivroCaixaContent");
  void import("@/app/(app)/conta-coop/ContaCoopContent");
  void import("@/app/(app)/cooperados/CooperadosContent");
}
