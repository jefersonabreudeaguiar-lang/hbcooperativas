/**
 * RQL 8.6 P1 — aquece chunks das 5 abas cooperado (além do prefetch de rotas Next).
 */
export function prefetchCooperadoTabRouteChunks(): void {
  if (typeof window === "undefined") return;
  void import("@/app/(app)/ficha-corrida/FichaCorridaContent");
  void import("@/app/(app)/dashboard/DashboardContent");
  void import("@/app/(app)/notas-pedido/NotasPedidoCooperadoMain");
  void import("@/app/(app)/precos/PrecosContent");
  void import("@/app/(app)/ficha-corrida/FichaCorridaContent");
  void import("@/app/(app)/mensalidades/MensalidadesContent");
}
