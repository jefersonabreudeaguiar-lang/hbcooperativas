/** Sem React — seguro para API routes e services importados no servidor. */
const STAFF_MOBILE_MQ = "(max-width: 1023px)";

export function isStaffMobileViewportActive(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(STAFF_MOBILE_MQ).matches;
}
