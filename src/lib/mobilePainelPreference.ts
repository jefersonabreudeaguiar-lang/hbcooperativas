/** Preferência local: no celular/PWA, abrir menu e permissões de responsável em vez do cooperado vinculado. */
export const PAINEL_RESPONSAVEL_MOBILE_KEY = "hb-coop-painel-responsavel-mobile";

export const PAINEL_MOBILE_PREF_EVENT = "hb-painel-mobile-pref";

export function preferPainelResponsavelMobile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PAINEL_RESPONSAVEL_MOBILE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPreferPainelResponsavelMobile(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) sessionStorage.setItem(PAINEL_RESPONSAVEL_MOBILE_KEY, "1");
    else sessionStorage.removeItem(PAINEL_RESPONSAVEL_MOBILE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PAINEL_MOBILE_PREF_EVENT));
}
