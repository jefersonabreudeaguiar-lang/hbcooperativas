import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { buildCooperadoLoginPath } from "@/lib/cooperado/cooperadoCanonicalEntryUrl";

/** Cooperado: entrada pelo launch (sem tela verde «Reparar atalho»). */
export function buildPwaRescueAutoLoginHref(build = APP_BUILD_VERSION): string {
  const next = buildCooperadoLoginPath(build);
  return `/pwa-launch.html?next=${encodeURIComponent(next)}`;
}

export function buildPwaRescueAutoLoginAbsoluteUrl(
  origin = "https://hbcooperativas.vercel.app"
): string {
  return `${origin.replace(/\/$/, "")}${buildPwaRescueAutoLoginHref()}`;
}
