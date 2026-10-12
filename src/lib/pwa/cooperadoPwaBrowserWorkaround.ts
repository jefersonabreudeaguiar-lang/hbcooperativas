/**
 * Workaround temporário: PWA standalone quebrado → cooperado usa o HB no Chrome
 * via pwa-rescue (limpa cache do ícone) e continua logado quando a sessão/cookie
 * já existir no perfil do navegador.
 */
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  buildPwaRescueAutoLoginAbsoluteUrl,
  buildPwaRescueCooperadoBrowserWorkaroundHref,
} from "@/lib/pwa/cooperadoPwaRescueUrl";
import {
  ensureCloudSessionReady,
  type CloudSessionProfile,
} from "@/lib/security/clientSession";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

/** Desligue quando o ícone PWA voltar a abrir normalmente. */
export const COOPERADO_PWA_BROWSER_WORKAROUND_ENABLED = true;

/** Link canônico de suporte (sempre HTTPS de produção, não o WebAPK). */
export const COOPERADO_PWA_BROWSER_ENTRY_ORIGIN = "https://hbcooperativas.vercel.app";

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

/**
 * URL enviada ao cooperado — pwa-rescue + login hb-pwa (produção).
 * Ex.: …/pwa-rescue.html?auto=1&next=%2Flogin%3Fhb-pwa%3D348
 */
export function cooperadoPwaBrowserEntryAbsoluteUrl(): string {
  return buildPwaRescueAutoLoginAbsoluteUrl(COOPERADO_PWA_BROWSER_ENTRY_ORIGIN);
}

export function cooperadoPwaBrowserWorkaroundAbsoluteUrl(): string {
  const href = buildPwaRescueCooperadoBrowserWorkaroundHref();
  return `${COOPERADO_PWA_BROWSER_ENTRY_ORIGIN.replace(/\/$/, "")}${href}`;
}

/** Abre fora do WebAPK — só gesto do usuário; não usa replace no ícone. */
export function openHbUrlInExternalBrowserFromUserGesture(absoluteHttpsUrl: string): void {
  if (typeof window === "undefined") return;
  const url = absoluteHttpsUrl.trim();
  const absolute =
    /^https?:\/\//i.test(url)
      ? url
      : `${COOPERADO_PWA_BROWSER_ENTRY_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;

  try {
    const anchor = document.createElement("a");
    anchor.href = absolute;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    /* ignore */
  }

  const opened = window.open(absolute, "_blank", "noopener,noreferrer");
  if (opened) return;

  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) {
    const tail = absolute.replace(/^https?:\/\//i, "");
    const intent = `intent://${tail}#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;end`;
    try {
      window.open(intent);
    } catch {
      /* ignore */
    }
  }
}

/** PWA cooperado → link de produção no navegador (toque no botão). */
export function launchCooperadoPwaBrowserWorkaround(
  profile?: CloudSessionProfile | null,
  _options?: { forceRetry?: boolean }
): void {
  void ensureCloudSessionReady(profile ?? undefined);
  openHbUrlInExternalBrowserFromUserGesture(cooperadoPwaBrowserEntryAbsoluteUrl());
}
