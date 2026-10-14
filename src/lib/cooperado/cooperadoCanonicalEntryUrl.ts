import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Destino padrão após login cooperado (Início). */
export const COOPERADO_DEFAULT_POST_LOGIN_PATH = "/dashboard";

/**
 * Login preparado para cooperados — padrão de produção:
 * `/login?hb-pwa=<build>&next=/dashboard`
 */
export function buildCooperadoLoginPath(build = APP_BUILD_VERSION): string {
  const q = new URLSearchParams();
  q.set("hb-pwa", String(build));
  q.set("next", COOPERADO_DEFAULT_POST_LOGIN_PATH);
  return `/login?${q.toString()}`;
}

/** `pwa-launch.html` → login canônico (ícone instalado). */
export function buildCooperadoPwaLaunchHref(build = APP_BUILD_VERSION): string {
  return `/pwa-launch.html?next=${encodeURIComponent(buildCooperadoLoginPath(build))}`;
}

export function buildCooperadoLoginAbsoluteUrl(
  origin = "https://hbcooperativas.vercel.app",
  build = APP_BUILD_VERSION
): string {
  return `${origin.replace(/\/$/, "")}${buildCooperadoLoginPath(build)}`;
}

/** Normaliza query do login (hb-pwa + next=/dashboard quando ausente). */
export function ensureCooperadoLoginSearchParams(
  input: URLSearchParams,
  build = APP_BUILD_VERSION
): { params: URLSearchParams; changed: boolean } {
  const params = new URLSearchParams(input.toString());
  let changed = false;
  if (!params.has("hb-pwa")) {
    params.set("hb-pwa", String(build));
    changed = true;
  }
  const next = params.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    params.set("next", COOPERADO_DEFAULT_POST_LOGIN_PATH);
    changed = true;
  }
  return { params, changed };
}
