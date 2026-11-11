import type { CooperadoNavPrefetchRouter } from "@/lib/performance/cooperadoNavPrefetch";
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";
import { staffGestaoPerfilPrefetchNavDelayMs } from "@/lib/staff/staffGestaoPerfilDesktop";

/** Rotas do dia do responsável — Início, Conferir, Pagar, Livro. */
export const STAFF_NAV_PREFETCH_PRIORITY: readonly string[] = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
  "/cooperados",
];

export const STAFF_MOBILE_PREFETCH_HREFS: readonly string[] = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
  "/cooperados",
  "/financeiro",
  "/relatorios",
  "/conta-coop",
  "/prestacao-contas",
];

/** PC: um prefetch leve das rotas do dia — sem dynamic import de abas inteiras. */
export function scheduleStaffNavPrefetchDesktop(router: CooperadoNavPrefetchRouter): () => void {
  let index = 0;
  let timer: number;
  const tick = () => {
    if (document.visibilityState === "visible") {
      const href = STAFF_NAV_PREFETCH_PRIORITY[index++];
      if (!href) return;
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }
    if (index < STAFF_NAV_PREFETCH_PRIORITY.length) timer = window.setTimeout(tick, 2_000);
  };
  timer = window.setTimeout(tick, staffGestaoPerfilPrefetchNavDelayMs() || 12_000);
  return () => window.clearTimeout(timer);
}

const mobileSchedules = new WeakMap<CooperadoNavPrefetchRouter, { users: number; stop: () => void }>();

/** Um único aquecimento gradual; nunca importa seis telas pesadas simultaneamente. */
export function scheduleStaffNavPrefetchEarly(router: CooperadoNavPrefetchRouter): () => void {
  if (typeof window === "undefined" || !isStaffMobileViewportActive()) return () => {};
  const existing = mobileSchedules.get(router);
  if (existing) {
    existing.users++;
    return () => { if (--existing.users === 0) { existing.stop(); mobileSchedules.delete(router); } };
  }
  let cancelled = false;
  let index = 0;
  let timer: number;
  const tick = () => {
    if (cancelled) return;
    if (document.visibilityState === "visible") {
      const href = STAFF_NAV_PREFETCH_PRIORITY[index++];
      if (!href) return;
      try { router.prefetch(href); } catch { /* navegação normal permanece disponível */ }
    }
    timer = window.setTimeout(tick, 1_500);
  };
  timer = window.setTimeout(tick, 4_000);
  const entry = { users: 1, stop: () => { cancelled = true; window.clearTimeout(timer); } };
  mobileSchedules.set(router, entry);
  return () => { if (--entry.users === 0) { entry.stop(); mobileSchedules.delete(router); } };
}
