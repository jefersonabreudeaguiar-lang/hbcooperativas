import { isAppStandalone } from "@/services/cooperadoAppInstallService";

/** No navegador (fora do ícone instalado) não exibir instalar/baixar app. */
export function shouldHideBaixarAppInstallPromoInBrowser(): boolean {
  if (typeof window === "undefined") return true;
  return !isAppStandalone();
}

export function shouldShowBaixarAppInstallPromo(): boolean {
  return !shouldHideBaixarAppInstallPromoInBrowser();
}

export function filterMenuHideBaixarAppInBrowser<T extends { href: string }>(
  items: T[]
): T[] {
  if (!shouldHideBaixarAppInstallPromoInBrowser()) return items;
  return items.filter((item) => item.href !== "/baixar-app");
}
