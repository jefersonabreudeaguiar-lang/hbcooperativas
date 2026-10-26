import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "@/lib/performance/staffBottomTabRoutes";
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";

const UNTIL_KEY = "hb.staff.tab-hop-quiet-until";
const LAST_PATH_KEY = "hb.staff.tab-hop-last-path";

/** Janela curta após troca de aba da gestão — sync e stats pesados esperam. */
const QUIET_MS_MOBILE = 1_200;
const QUIET_MS_DESKTOP = 2_400;

function staffTabHopQuietMs(): number {
  if (typeof window === "undefined") return QUIET_MS_MOBILE;
  return isStaffMobileViewportActive() ? QUIET_MS_MOBILE : QUIET_MS_DESKTOP;
}

export function markStaffTabPathChange(pathname: string): void {
  if (!isStaffBottomTabPath(pathname)) return;
  if (typeof sessionStorage === "undefined") return;
  const path = staffBottomTabCacheKey(pathname);
  try {
    const prev = sessionStorage.getItem(LAST_PATH_KEY);
    if (prev && prev !== path) {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + staffTabHopQuietMs()));
    }
    sessionStorage.setItem(LAST_PATH_KEY, path);
  } catch {
    /* quota */
  }
}

export function staffTabSwitchQuiescenceActive(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(UNTIL_KEY) ?? "0");
    return Number.isFinite(until) && until > 0 && Date.now() < until;
  } catch {
    return false;
  }
}
