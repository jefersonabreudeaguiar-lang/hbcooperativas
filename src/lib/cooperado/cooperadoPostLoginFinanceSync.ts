import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const SESSION_KEY = "hb-cooperado-post-login-finance";

/** Marca que o cooperado acabou de autenticar — força sync financeiro na primeira tela. */
export function markCooperadoPostLoginFinanceSync(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, String(APP_BUILD_VERSION));
}

/** Uma vez por login — retorna true na primeira leitura após marcar. */
export function consumeCooperadoPostLoginFinanceSync(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  sessionStorage.removeItem(SESSION_KEY);
  return true;
}
