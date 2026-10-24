import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "@/lib/performance/staffBottomTabRoutes";

const UNTIL_KEY = "hb.staff.tab-hop-quiet-until";
const LAST_PATH_KEY = "hb.staff.tab-hop-last-path";

/** Janela curta após troca de aba da gestão — sync e stats pesados esperam. */
const QUIET_MS = 3_500;

export function markStaffTabPathChange(pathname: string): void {
  if (!isStaffBottomTabPath(pathname)) return;
  if (typeof sessionStorage === "undefined") return;
  const path = staffBottomTabCacheKey(pathname);
  try {
    const prev = sessionStorage.getItem(LAST_PATH_KEY);
    if (prev && prev !== path) {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + QUIET_MS));
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
