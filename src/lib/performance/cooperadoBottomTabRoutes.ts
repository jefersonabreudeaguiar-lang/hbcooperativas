/** Rotas da barra inferior do cooperado (4 abas) — fonte única RQL 8.6. */
export const COOPERADO_BOTTOM_TAB_HREFS = [
  "/dashboard",
  "/notas-pedido",
  "/precos",
  "/ficha-corrida",
] as const;

export type CooperadoBottomTabHref = (typeof COOPERADO_BOTTOM_TAB_HREFS)[number];

export function isCooperadoBottomTabPath(pathname: string): pathname is CooperadoBottomTabHref {
  return (COOPERADO_BOTTOM_TAB_HREFS as readonly string[]).includes(pathname);
}
