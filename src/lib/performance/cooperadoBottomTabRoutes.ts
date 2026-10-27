import { isV2HbOnlyClient } from "@/lib/product/v2HbOnly";

/** Rotas da barra inferior do cooperado (legado — 4 abas). */
export const COOPERADO_BOTTOM_TAB_HREFS_LEGACY = [
  "/dashboard",
  "/notas-pedido",
  "/precos",
  "/ficha-corrida",
] as const;

/** @deprecated Prefer `cooperadoBottomTabHrefs()` — valor legado para imports antigos. */
export const COOPERADO_BOTTOM_TAB_HREFS = COOPERADO_BOTTOM_TAB_HREFS_LEGACY;

export type CooperadoBottomTabHref =
  | (typeof COOPERADO_BOTTOM_TAB_HREFS_LEGACY)[number]
  | "/minha-conta-coop";

export function cooperadoBottomTabHrefs(): readonly string[] {
  if (isV2HbOnlyClient()) return ["/dashboard", "/minha-conta-coop"];
  return COOPERADO_BOTTOM_TAB_HREFS_LEGACY;
}

export function isCooperadoBottomTabPath(pathname: string): pathname is CooperadoBottomTabHref {
  return cooperadoBottomTabHrefs().includes(pathname);
}
