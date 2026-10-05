/** Rotas da barra inferior mobile da gestão (responsável / tesoureiro / admin coop). */
export const STAFF_BOTTOM_TAB_HREFS = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
  "/conta-coop",
  "/votacoes",
  "/cooperados",
  "/contratos",
  "/meu-perfil",
  "/relatorios",
  "/contador/dashboard",
  "/comunicados",
] as const;

export type StaffBottomTabHref = (typeof STAFF_BOTTOM_TAB_HREFS)[number];

/** Chave estável do painel em cache (pathname pode ter sub-rota). */
export function staffBottomTabCacheKey(pathname: string): string {
  if ((STAFF_BOTTOM_TAB_HREFS as readonly string[]).includes(pathname)) return pathname;
  for (const href of STAFF_BOTTOM_TAB_HREFS) {
    if (href === "/dashboard") continue;
    if (pathname === href || pathname.startsWith(`${href}/`)) return href;
  }
  return pathname;
}

export function isStaffBottomTabPath(pathname: string): boolean {
  const key = staffBottomTabCacheKey(pathname);
  return (STAFF_BOTTOM_TAB_HREFS as readonly string[]).includes(key);
}
