import { isAppStandalone } from "@/services/cooperadoAppInstallService";

/** No navegador (fora do ícone instalado) não exibir instalar/baixar app. */
export function shouldHideBaixarAppInstallPromoInBrowser(): boolean {
  if (typeof window === "undefined") return true;
  return !isAppStandalone();
}

export function shouldShowBaixarAppInstallPromo(): boolean {
  return !shouldHideBaixarAppInstallPromoInBrowser();
}

/** Menu ☰ do cooperado no navegador — único lugar da promo de instalar. */
export function shouldShowBaixarAppInCooperadoOverflowMenu(): boolean {
  return shouldHideBaixarAppInstallPromoInBrowser();
}
