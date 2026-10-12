import { BUILD_SEEN_KEY } from "@/lib/pwa/clientRelease";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";

export const PROFILE_REPAIR_RECENT_KEY = "hb-coop-profile-repair-at";
export const PROFILE_REPAIR_RECENT_MS = 30_000;

function markProfileRepairChecked(): void {
  try {
    sessionStorage?.setItem(PROFILE_REPAIR_RECENT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function profileRepairCheckedRecently(): boolean {
  try {
    const raw = sessionStorage?.getItem(PROFILE_REPAIR_RECENT_KEY);
    if (!raw) return false;
    const t = parseInt(raw, 10);
    return Number.isFinite(t) && Date.now() - t < PROFILE_REPAIR_RECENT_MS;
  } catch {
    return false;
  }
}

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
  if (profileRepairCheckedRecently()) return false;

  const official = await fetchOfficialClientRelease();
  let cloudBuild = official?.build ?? 0;
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
    markProfileRepairChecked();
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
