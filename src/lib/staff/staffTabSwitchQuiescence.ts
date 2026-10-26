import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "@/lib/performance/staffBottomTabRoutes";
import { staffGestaoPerfilTabHopQuietMs } from "@/lib/staff/staffGestaoPerfilDesktop";

const UNTIL_KEY = "hb.staff.tab-hop-quiet-until";
const LAST_PATH_KEY = "hb.staff.tab-hop-last-path";

function staffTabHopQuietMs(): number {
  if (typeof window === "undefined") return 1_200;
  return staffGestaoPerfilTabHopQuietMs();
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
