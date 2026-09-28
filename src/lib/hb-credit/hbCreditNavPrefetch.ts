/** Rotas HB / Início — prefetch agressivo no menu (Next Link). */
export function shouldPrefetchHbCreditNav(href: string): boolean {
  if (href === "/dashboard" || href.startsWith("/dashboard/")) return true;
  if (href === "/minha-conta-coop" || href.startsWith("/minha-conta-coop")) return true;
  if (href === "/conta-coop" || href.startsWith("/conta-coop")) return true;
  return false;
}
