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
