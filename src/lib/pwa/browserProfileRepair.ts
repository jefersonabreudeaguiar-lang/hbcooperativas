import { BUILD_SEEN_KEY } from "@/lib/pwa/clientRelease";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

export type RepairBrowserProfileOptions = {
  /** Ícone instalado (PWA): também repara — antes ignorava só standalone. */
  includeStandalone?: boolean;
};

/**
 * Aba normal com JS/HTML antigo misturado quebra o dashboard (“This page couldn’t load”).
 * Alinha cache + SW com o build em produção antes de carregar o painel cooperado.
 */
export async function repairBrowserProfileIfStale(
  options?: RepairBrowserProfileOptions
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  if (standalone && !options?.includeStandalone) return false;

  let cloudBuild = 0;
  try {
    const res = await fetch(`/api/client-release?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.ok) {
      const json = (await res.json()) as { build?: number };
      cloudBuild = Number(json.build) || 0;
    }
  } catch {
    return false;
  }

  if (cloudBuild <= 0) cloudBuild = APP_BUILD_VERSION;

  const pageBuild = parseInt(
    document.documentElement.getAttribute("data-app-build") ?? "",
    10
  );
  const seenRaw = localStorage.getItem(BUILD_SEEN_KEY);
  const seenBuild = seenRaw ? parseInt(seenRaw, 10) : 0;

  const htmlStale = pageBuild > 0 && cloudBuild > pageBuild;
  const profileStale = seenBuild > 0 && cloudBuild !== seenBuild;
  const neverSeen = !seenRaw && cloudBuild > 0;

  if (!htmlStale && !profileStale && !neverSeen) {
    try {
      localStorage.setItem(BUILD_SEEN_KEY, String(cloudBuild));
    } catch {
      /* ignore */
    }
    return false;
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    localStorage.setItem(BUILD_SEEN_KEY, String(cloudBuild));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}
