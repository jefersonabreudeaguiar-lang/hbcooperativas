/**
 * Workaround temporário: PWA standalone quebrado → cooperado usa o HB no Chrome
 * via pwa-rescue (limpa cache do ícone) e continua logado quando a sessão/cookie
 * já existir no perfil do navegador.
 */
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  buildPwaRescueCooperadoBrowserWorkaroundHref,
} from "@/lib/pwa/cooperadoPwaRescueUrl";
import {
  ensureCloudSessionReady,
  type CloudSessionProfile,
} from "@/lib/security/clientSession";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

/** Desligue quando o ícone PWA voltar a abrir normalmente. */
export const COOPERADO_PWA_BROWSER_WORKAROUND_ENABLED = true;

const BAIXAR_APP_HREF = "/baixar-app";
const LOCAL_SESSION_KEY = "coopeagriplla_session";

function readStoredCooperadoSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { role?: string; cooperadoId?: string };
    return parsed.role === "cooperado" || Boolean(parsed.cooperadoId?.trim());
  } catch {
    return false;
  }
}
/** Cooperado escolheu sair do modo “use o Chrome” neste aparelho. */
export const COOPERADO_PWA_BROWSER_WORKAROUND_OPT_OUT_KEY =
  "hb-coop-pwa-browser-workaround-opt-out";

/** Evita redirect em loop no ícone (rescue → dashboard → redirect de novo). */
export const COOPERADO_PWA_BROWSER_HANDOFF_SESSION_KEY =
  "hb-coop-pwa-browser-handoff";

export function hasCooperadoPwaBrowserHandoffInSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(COOPERADO_PWA_BROWSER_HANDOFF_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCooperadoPwaBrowserHandoffSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(COOPERADO_PWA_BROWSER_HANDOFF_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearCooperadoPwaBrowserHandoffSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(COOPERADO_PWA_BROWSER_HANDOFF_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isCooperadoPwaBrowserWorkaroundOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COOPERADO_PWA_BROWSER_WORKAROUND_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function isCooperadoPwaBrowserWorkaroundGloballyActive(): boolean {
  return COOPERADO_PWA_BROWSER_WORKAROUND_ENABLED && !isCooperadoPwaBrowserWorkaroundOptedOut();
}

/** Restaura ícone PWA, banner de instalar e sync normal neste dispositivo. */
export function voltarCooperadoParaAppNormal(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COOPERADO_PWA_BROWSER_WORKAROUND_OPT_OUT_KEY, "1");
  } catch {
    /* ignore */
  }
  clearCooperadoPwaBrowserHandoffSession();
  window.location.reload();
}

/** Cooperado no navegador (workaround): não mostrar instalar/baixar app. */
export function shouldHideCooperadoBaixarAppPromo(
  userRole?: string | null
): boolean {
  if (!isCooperadoPwaBrowserWorkaroundGloballyActive()) return false;
  if (typeof window !== "undefined" && isAppStandalone()) return false;
  if (userRole && userRole !== "cooperado") return false;
  return true;
}

export function filterCooperadoMenuHideBaixarApp<T extends { href: string }>(
  items: T[]
): T[] {
  if (!shouldHideCooperadoBaixarAppPromo("cooperado")) return items;
  return items.filter((item) => item.href !== BAIXAR_APP_HREF);
}

function isCooperadoPwaStandaloneTarget(): boolean {
  if (typeof window === "undefined") return false;
  if (!isAppStandalone()) return false;
  if (isCooperadoPwaMessengerMode()) return true;
  return readStoredCooperadoSession();
}

/** Tela inicial no ícone: botão para abrir o link no navegador. */
export function shouldShowCooperadoPwaAbrirNavegadorGate(
  userRole?: string | null
): boolean {
  if (!isCooperadoPwaBrowserWorkaroundGloballyActive()) return false;
  if (!isCooperadoPwaStandaloneTarget()) return false;
  if (userRole && userRole !== "cooperado") return false;
  if (!userRole && !readStoredCooperadoSession()) return false;
  return true;
}

/** @deprecated Use shouldShowCooperadoPwaAbrirNavegadorGate — mantido para testes. */
export function shouldCooperadoPwaUseBrowserWorkaround(): boolean {
  return shouldShowCooperadoPwaAbrirNavegadorGate("cooperado");
}

export function cooperadoPwaBrowserWorkaroundAbsoluteUrl(
  origin = typeof window !== "undefined" ? window.location.origin : "https://hbcooperativas.vercel.app"
): string {
  const href = buildPwaRescueCooperadoBrowserWorkaroundHref();
  return `${origin.replace(/\/$/, "")}${href}`;
}

/** Abre URL HTTPS no Chrome (Android) ou navegação direta. */
export function openHbUrlInSystemBrowser(absoluteHttpsUrl: string): void {
  if (typeof window === "undefined") return;
  const url = absoluteHttpsUrl.trim();
  const absolute =
    /^https?:\/\//i.test(url)
      ? url
      : `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;

  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) {
    const tail = absolute.replace(/^https?:\/\//i, "");
    const encodedFallback = encodeURIComponent(absolute);
    const intent = `intent://${tail}#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;S.browser_fallback_url=${encodedFallback};end`;
    try {
      window.location.href = intent;
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      try {
        window.location.replace(absolute);
      } catch {
        /* ignore */
      }
    }, 280);
    return;
  }

  window.location.replace(absolute);
}

/** PWA cooperado → reparo + login/dashboard (sem esperar rede). */
export function launchCooperadoPwaBrowserWorkaround(
  _profile?: CloudSessionProfile | null,
  options?: { forceRetry?: boolean }
): void {
  if (options?.forceRetry) clearCooperadoPwaBrowserHandoffSession();
  markCooperadoPwaBrowserHandoffSession();
  void ensureCloudSessionReady(_profile ?? undefined);
  openHbUrlInSystemBrowser(cooperadoPwaBrowserWorkaroundAbsoluteUrl());
}
