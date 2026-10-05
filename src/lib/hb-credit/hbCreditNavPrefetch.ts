import { COOPERADO_BOTTOM_TAB_HREFS } from "@/lib/performance/cooperadoBottomTabRoutes";

/** Aba Financeiro — bundle maior; prefetch prioritário no cooperado. */
export const COOPERADO_FINANCEIRO_TAB_HREF = "/ficha-corrida";

/** Rotas do cooperado (barra inferior + conta HB) — prefetch para troca instantânea. */
export const COOPERADO_MOBILE_PREFETCH_HREFS = [
  ...COOPERADO_BOTTOM_TAB_HREFS,
  "/minha-conta-coop",
] as const;

/** Rotas HB / Início — prefetch agressivo no menu (Next Link). */
export function shouldPrefetchHbCreditNav(href: string): boolean {
  if (href === "/conta-coop" || href.startsWith("/conta-coop/")) return false;
  return COOPERADO_MOBILE_PREFETCH_HREFS.some(
    (r) => href === r || href.startsWith(`${r}/`)
  );
}
