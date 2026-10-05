import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
  STAFF_BOTTOM_TAB_HREFS,
} from "@/lib/performance/staffBottomTabRoutes";

export { STAFF_BOTTOM_TAB_HREFS, isStaffBottomTabPath, staffBottomTabCacheKey };

const OFF = new Set(["false", "0", "no", "off"]);

function readKeepAliveEnvDefault(): boolean {
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_STAFF_TAB_KEEP_ALIVE ?? "true")
      : "true";
  return !OFF.has(raw.trim().toLowerCase());
}

/** U4 — LRU de abas montadas no mobile da gestão. Default ligado; `NEXT_PUBLIC_STAFF_TAB_KEEP_ALIVE=false` desliga. */
export function isStaffMobileTabKeepAliveEnabled(): boolean {
  if (typeof document !== "undefined") {
    const dom = document.documentElement.getAttribute("data-staff-tab-keep-alive");
    if (dom === "0") return false;
    if (dom === "1") return true;
  }
  return readKeepAliveEnvDefault();
}

export function getStaffMobileTabCacheLimit(lowMemoryDevice: boolean): number {
  return lowMemoryDevice ? 2 : 5;
}

export const STAFF_TAB_PIN_HREF = "/notas-pedido" as const;

export const STAFF_TAB_HEAVY_HREFS = ["/notas-pedido", "/ficha-corrida", "/relatorios"] as const;

export function pickStaffTabCacheEviction(
  order: readonly string[],
  activeHref: string,
  lowMemoryDevice: boolean
): string | undefined {
  const candidates = order.filter((h) => h !== activeHref && h !== STAFF_TAB_PIN_HREF);
  if (candidates.length === 0) return undefined;

  if (lowMemoryDevice) {
    const heavyCached = candidates.filter((h) =>
      (STAFF_TAB_HEAVY_HREFS as readonly string[]).includes(h)
    );
    if (heavyCached.length >= 2) {
      const drop = heavyCached.find((h) => h !== activeHref);
      if (drop) return drop;
    }
    const otherHeavy = candidates.find((h) =>
      (STAFF_TAB_HEAVY_HREFS as readonly string[]).includes(h)
    );
    if (otherHeavy && (STAFF_TAB_HEAVY_HREFS as readonly string[]).includes(activeHref)) {
      return otherHeavy;
    }
  }

  return candidates[candidates.length - 1];
}

export function trimStaffTabCacheOrder(
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
    const drop = pickStaffTabCacheEviction(cache, activeHref, lowMemoryDevice);
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
