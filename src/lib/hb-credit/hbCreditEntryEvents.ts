/** Sinaliza fim do fetchCreditAccount na tela HB — aux syncs podem iniciar depois. */

export const HB_CREDIT_ACCOUNT_LOADED_EVENT = "hb-credit-account-loaded";

export function notifyHbCreditAccountLoaded(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HB_CREDIT_ACCOUNT_LOADED_EVENT));
}
