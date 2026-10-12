import { cooperadoTabWarmPanelPaintReady } from "@/lib/performance/cooperadoMobileTabKeepAlive";

/** Par fixo Início/Financeiro — painel já visitado e servido do keep-alive (troca instantânea). */
export type CooperadoInicioFinanceiroTabHref = "/dashboard" | "/ficha-corrida";

export function isCooperadoInicioFinanceiroWarmTabRevisit(
  panelHref: CooperadoInicioFinanceiroTabHref
): boolean {
  return cooperadoTabWarmPanelPaintReady(panelHref);
}
