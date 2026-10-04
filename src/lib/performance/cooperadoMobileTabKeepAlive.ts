/** Rotas da barra inferior do cooperado (5 abas) — alinhado a `COOPERADO_MOBILE_NAV_HREFS`. */
export const COOPERADO_BOTTOM_TAB_HREFS: readonly string[] = [
  "/dashboard",
  "/notas-pedido",
  "/precos",
  "/ficha-corrida",
  "/mensalidades",
];

export function isCooperadoBottomTabPath(pathname: string): boolean {
  return COOPERADO_BOTTOM_TAB_HREFS.includes(pathname);
}

/** Fail-closed: ligar só com NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE=true (default off — evita 2–5 telas pesadas vivas). */
export function isCooperadoMobileTabKeepAliveEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = (process.env.NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE ?? "false").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Abas inativas mantidas montadas — 2 no padrão, 1 em aparelho com pouca RAM. */
export function getCooperadoMobileTabCacheLimit(lowMemoryDevice: boolean): number {
  return lowMemoryDevice ? 1 : 2;
}
