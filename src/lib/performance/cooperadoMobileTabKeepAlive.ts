import {
  COOPERADO_BOTTOM_TAB_HREFS,
  isCooperadoBottomTabPath,
} from "@/lib/performance/cooperadoBottomTabRoutes";

export { COOPERADO_BOTTOM_TAB_HREFS, isCooperadoBottomTabPath };

const OFF = new Set(["false", "0", "no", "off"]);

function readKeepAliveEnvDefault(): boolean {
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE ?? "true")
      : "true";
  return !OFF.has(raw.trim().toLowerCase());
}

/** RQL 8.6 — LRU de abas montadas no mobile cooperado. Default **ligado**; `NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE=false` desliga. */
export function isCooperadoMobileTabKeepAliveEnabled(): boolean {
  if (typeof document !== "undefined") {
    const dom = document.documentElement.getAttribute("data-cooperado-tab-keep-alive");
    if (dom === "0") return false;
    if (dom === "1") return true;
  }
  return readKeepAliveEnvDefault();
}

/** LRU enxuto — 3 abas no padrão (rápido); 2 em aparelho fraco. */
export function getCooperadoMobileTabCacheLimit(lowMemoryDevice: boolean): number {
  return lowMemoryDevice ? 2 : 4;
}

/** Início — preferir manter montado no LRU (P1). */
export const COOPERADO_TAB_PIN_HREF = "/dashboard" as const;

/** Financeiro — segunda aba crítica; não expulsar do LRU (troca instantânea). */
export const COOPERADO_TAB_FINANCEIRO_HREF = "/ficha-corrida" as const;

const COOPERADO_TAB_PINNED: readonly string[] = [
  COOPERADO_TAB_PIN_HREF,
  COOPERADO_TAB_FINANCEIRO_HREF,
];

export function isCooperadoTabPinned(href: string): boolean {
  return COOPERADO_TAB_PINNED.includes(href);
}

/** Par leve — preferir expulsar do LRU antes das abas pesadas. */
export const COOPERADO_TAB_LIGHT_HREFS = ["/precos"] as const;

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
  const candidates = order.filter((h) => h !== activeHref && !isCooperadoTabPinned(h));
  if (candidates.length === 0) return undefined;

  const lightCached = candidates.filter((h) =>
    (COOPERADO_TAB_LIGHT_HREFS as readonly string[]).includes(h)
  );
  if (lightCached.length > 0) {
    return lightCached[lightCached.length - 1];
  }

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

/** Painel LRU já montado — paint RQL pode marcar no mesmo frame (revisita de aba). */
export function cooperadoTabWarmPanelPaintReady(pathname: string): boolean {
  if (typeof document === "undefined" || !isCooperadoBottomTabPath(pathname)) return false;
  const el = document.querySelector(
    `[data-cooperado-tab-panel="${pathname}"][data-cooperado-tab-panel-warm="1"]`
  );
  return Boolean(el);
}
