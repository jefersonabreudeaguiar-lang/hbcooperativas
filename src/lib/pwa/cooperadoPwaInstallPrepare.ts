import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  BUILD_SEEN_KEY,
  PWA_REPAIR_SESSION_KEY,
  clearClientRuntimeCaches,
} from "@/lib/pwa/clientRelease";
import { PWA_REPAIR_LOCAL_BUILD_KEY } from "@/lib/pwa/staleProfileGuard";

/** Cooperado passou pela URL canônica de instalação (`/login?hb-pwa=`). */
export const PWA_INSTALL_READY_KEY = "hb-coop-pwa-install-ready-build";

export function markPwaRepairSessionForBuild(build = APP_BUILD_VERSION): void {
  const ver = String(build);
  try {
    sessionStorage.setItem(PWA_REPAIR_SESSION_KEY, ver);
    localStorage.setItem(BUILD_SEEN_KEY, ver);
    localStorage.setItem(PWA_INSTALL_READY_KEY, ver);
    localStorage.setItem(PWA_REPAIR_LOCAL_BUILD_KEY, ver);
  } catch {
    /* ignore */
  }
}

async function fetchCloudBuild(): Promise<number> {
  try {
    const res = await fetch(`/api/client-release?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return APP_BUILD_VERSION;
    const json = (await res.json()) as { build?: number };
    const n = Number(json.build);
    return Number.isFinite(n) && n > 0 ? n : APP_BUILD_VERSION;
  } catch {
    return APP_BUILD_VERSION;
  }
}

/**
 * Antes de “Instalar app” no Chrome: alinha cache/SW ao build em produção.
 * No login com `hb-pwa`, só limpa se o perfil ainda estiver desatualizado.
 */
export async function prepareBrowserProfileForPwaInstall(
  mode: "install" | "login-canonical" = "login-canonical"
): Promise<void> {
  if (typeof window === "undefined") return;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return;

  const cloudBuild = await fetchCloudBuild();
  const ver = String(cloudBuild);
  let seen = 0;
  let repairOk = false;
  try {
    seen = parseInt(localStorage.getItem(BUILD_SEEN_KEY) ?? "", 10) || 0;
    repairOk = sessionStorage.getItem(PWA_REPAIR_SESSION_KEY) === ver;
  } catch {
    /* ignore */
  }

  const pageBuild = parseInt(
    document.documentElement.getAttribute("data-app-build") ?? "",
    10
  );
  const htmlStale = pageBuild > 0 && cloudBuild > pageBuild;
  const profileStale = seen > 0 && seen !== cloudBuild;
  const needsPurge =
    mode === "install" || htmlStale || profileStale || !repairOk || seen === 0;

  if (needsPurge) {
    await clearClientRuntimeCaches();
  }

  markPwaRepairSessionForBuild(cloudBuild);
}
