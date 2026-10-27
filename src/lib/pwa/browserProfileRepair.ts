import { BUILD_SEEN_KEY } from "@/lib/pwa/clientRelease";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { getSession } from "@/services/dataStore";

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
  /** Piloto: segunda fase em idle (não adiar de novo). */
  forceNetworkCheck?: boolean;
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
  /** WebAPK: nunca hard-reload automático no login (GuestRoute marca reparo no ícone). */
  if (standalone) return false;
  if (profileRepairCheckedRecently()) return false;

  const session = getSession();
  /** Responsável/gestão: não limpar SW/cache no mesmo fluxo do cooperado (evita tela preta no painel). */
  if (session && session.role !== "cooperado") {
    markProfileRepairChecked();
    return false;
  }
  if (session && isCooperadoMobileGaPromoted(session) && !options?.forceNetworkCheck) {
    markProfileRepairChecked();
    const laterOpts = { ...options, forceNetworkCheck: true };
    const runLater = () => {
      void repairBrowserProfileIfStale(laterOpts);
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runLater, { timeout: 15_000 });
    } else {
      window.setTimeout(runLater, 8_000);
    }
    return false;
  }

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

  const standalonePwa =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (standalonePwa && session?.role === "cooperado") {
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
