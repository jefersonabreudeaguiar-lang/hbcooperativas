import {
  COOPERADO_BOTTOM_TAB_HREFS,
  isCooperadoBottomTabPath,
} from "@/lib/performance/cooperadoBottomTabRoutes";

export { COOPERADO_BOTTOM_TAB_HREFS, isCooperadoBottomTabPath };

const OFF = new Set(["false", "0", "no", "off"]);

/** RQL 8.6 — LRU de abas montadas no mobile cooperado. Default **ligado**; `NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE=false` desliga. */
export function isCooperadoMobileTabKeepAliveEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = (process.env.NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE ?? "true").trim().toLowerCase();
  return !OFF.has(v);
}

/** Abas inativas mantidas montadas — 2 no padrão, 1 em aparelho com pouca RAM. */
export function getCooperadoMobileTabCacheLimit(lowMemoryDevice: boolean): number {
  return lowMemoryDevice ? 1 : 2;
}
