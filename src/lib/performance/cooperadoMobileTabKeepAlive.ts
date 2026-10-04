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

/** Fail-closed: desligar com NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE=false */
export function isCooperadoMobileTabKeepAliveEnabled(): boolean {
  if (typeof process === "undefined") return true;
  const v = (process.env.NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE ?? "true").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}
