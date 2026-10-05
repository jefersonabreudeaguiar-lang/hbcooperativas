import {
  COOPERADO_BOTTOM_TAB_HREFS,
  isCooperadoBottomTabPath,
} from "@/lib/performance/cooperadoBottomTabRoutes";

export { COOPERADO_BOTTOM_TAB_HREFS, isCooperadoBottomTabPath };

const OFF = new Set(["false", "0", "no", "off"]);

/** RQL 8.6 — LRU de abas montadas no mobile cooperado. Default **ligado**; `NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE=false` desliga. */
export function isCooperadoMobileTabKeepAliveEnabled(): boolean {
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE ?? "true")
      : "true";
  const v = raw.trim().toLowerCase();
  return !OFF.has(v);
}

/** Abas inativas mantidas montadas — 2 no padrão, 1 em aparelho com pouca RAM. */
export function getCooperadoMobileTabCacheLimit(lowMemoryDevice: boolean): number {
  return lowMemoryDevice ? 1 : 2;
}

/** Início — preferir manter montado no LRU (P1). */
export const COOPERADO_TAB_PIN_HREF = "/dashboard" as const;

/** Par pesado — evitar os dois juntos em aparelho com pouca RAM. */
export const COOPERADO_TAB_HEAVY_HREFS = ["/notas-pedido", "/ficha-corrida"] as const;

/**
 * Escolhe qual aba inativa expulsar do LRU antes da mais recente (P1).
 * Retorna undefined se nada a remover além de `activeHref`.
 */
export function pickCooperadoTabCacheEviction(
  order: readonly string[],
  activeHref: string,
  lowMemoryDevice: boolean
): string | undefined {
  const candidates = order.filter((h) => h !== activeHref && h !== COOPERADO_TAB_PIN_HREF);
  if (candidates.length === 0) return undefined;

  if (lowMemoryDevice) {
    const heavyCached = candidates.filter((h) =>
      (COOPERADO_TAB_HEAVY_HREFS as readonly string[]).includes(h)
    );
    if (heavyCached.length >= 2) {
      const drop = heavyCached.find((h) => h !== activeHref);
      if (drop) return drop;
    }
    const otherHeavy = candidates.find((h) =>
      (COOPERADO_TAB_HEAVY_HREFS as readonly string[]).includes(h)
    );
    if (otherHeavy && (COOPERADO_TAB_HEAVY_HREFS as readonly string[]).includes(activeHref)) {
      return otherHeavy;
    }
  }

  return candidates[candidates.length - 1];
}

export function trimCooperadoTabCacheOrder(
  order: string[],
  activeHref: string,
  limit: number,
  lowMemoryDevice: boolean
): string[] {
  const next = [...order];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const href of [activeHref, ...next.filter((h) => h !== activeHref)]) {
    if (seen.has(href)) continue;
    seen.add(href);
    deduped.push(href);
  }

  const cache = deduped;
  while (cache.length > limit) {
    const drop = pickCooperadoTabCacheEviction(cache, activeHref, lowMemoryDevice);
    if (!drop) {
      cache.pop();
      continue;
    }
    const idx = cache.lastIndexOf(drop);
    if (idx < 0) {
      cache.pop();
      continue;
    }
    cache.splice(idx, 1);
  }
  return cache;
}
