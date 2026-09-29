/** Rotas do cooperado (barra inferior) — prefetch para troca instantânea. */
export const COOPERADO_MOBILE_PREFETCH_HREFS = [
  "/dashboard",
  "/notas-pedido",
  "/precos",
  "/ficha-corrida",
  "/mensalidades",
  "/minha-conta-coop",
] as const;

/** Rotas HB / Início — prefetch agressivo no menu (Next Link). */
export function shouldPrefetchHbCreditNav(href: string): boolean {
  if (href === "/conta-coop" || href.startsWith("/conta-coop/")) return false;
  return COOPERADO_MOBILE_PREFETCH_HREFS.some(
    (r) => href === r || href.startsWith(`${r}/`)
  );
}
