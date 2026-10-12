import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Link que limpa cache do ícone e volta ao login preparado (mesmo fluxo do suporte). */
export function buildPwaRescueAutoLoginHref(build = APP_BUILD_VERSION): string {
  const next = `/login?hb-pwa=${build}`;
  return `/pwa-rescue.html?auto=1&next=${encodeURIComponent(next)}`;
}

export function buildPwaRescueAutoLoginAbsoluteUrl(
  origin = "https://hbcooperativas.vercel.app"
): string {
  return `${origin.replace(/\/$/, "")}${buildPwaRescueAutoLoginHref()}`;
}

/** Após o reparo, login com hb-pwa e volta ao app no navegador (não no ícone PWA). */
export function buildPwaRescueCooperadoBrowserWorkaroundHref(
  build = APP_BUILD_VERSION,
  afterLoginPath = "/dashboard"
): string {
  const loginNext = `/login?hb-pwa=${build}&next=${encodeURIComponent(afterLoginPath)}`;
  return `/pwa-rescue.html?auto=1&next=${encodeURIComponent(loginNext)}`;
}

export function buildPwaRescueCooperadoBrowserWorkaroundAbsoluteUrl(
  origin = "https://hbcooperativas.vercel.app",
  build = APP_BUILD_VERSION,
  afterLoginPath = "/dashboard"
): string {
  return `${origin.replace(/\/$/, "")}${buildPwaRescueCooperadoBrowserWorkaroundHref(build, afterLoginPath)}`;
}
