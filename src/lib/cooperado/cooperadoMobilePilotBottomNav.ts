import type { User, Resource } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";

export const COOPERADO_PILOT_HB_PAY_TAB_HREF = "/minha-conta-coop/escanear";

export type CooperadoPilotBottomNavItem = {
  href: string;
  label: string;
  resource: Resource;
};

/** Barra inferior cooperado — aba central «Pagar» (QR HB Créditos), só piloto Jeferson. */
export function cooperadoPilotMobileBottomNavItems(
  baseItems: CooperadoPilotBottomNavItem[],
  user: Omit<User, "password"> | null | undefined,
  hbNavEligible: boolean
): CooperadoPilotBottomNavItem[] {
  if (!user || user.role !== "cooperado" || !isCooperadoMobilePilot(user) || !hbNavEligible) {
    return baseItems;
  }
  if (baseItems.some((i) => i.href === COOPERADO_PILOT_HB_PAY_TAB_HREF)) return baseItems;
  const items = [...baseItems];
  const entregasIdx = items.findIndex((i) => i.href === "/notas-pedido");
  const pay: CooperadoPilotBottomNavItem = {
    href: COOPERADO_PILOT_HB_PAY_TAB_HREF,
    label: "Pagar",
    resource: "conta_coop",
  };
  if (entregasIdx >= 0) {
    items.splice(entregasIdx + 1, 0, pay);
  } else {
    items.push(pay);
  }
  return items;
}

export function isCooperadoPilotHbPayBottomTab(href: string): boolean {
  return href === COOPERADO_PILOT_HB_PAY_TAB_HREF;
}

export function cooperadoPilotBottomNavItemActive(pathname: string, href: string): boolean {
  if (isCooperadoPilotHbPayBottomTab(href)) {
    return (
      pathname === href ||
      pathname === "/minha-conta-coop" ||
      pathname.startsWith("/minha-conta-coop/")
    );
  }
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function cooperadoPilotMobileBottomNavEnabled(
  user: Omit<User, "password"> | null | undefined,
  hbNavEligible: boolean
): boolean {
  return Boolean(user && user.role === "cooperado" && isCooperadoMobilePilot(user) && hbNavEligible);
}
