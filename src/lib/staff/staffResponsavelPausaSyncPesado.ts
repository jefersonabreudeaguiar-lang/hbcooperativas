import { isStaffMobileTabKeepAliveEnabled } from "@/lib/performance/staffMobileTabKeepAlive";
import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";

/** Pausa sync/pull automático logo após troca de aba no mobile (gestão). */
export function staffResponsavelPausaSyncPesado(): boolean {
  if (!staffTabSwitchQuiescenceActive()) return false;
  if (typeof window === "undefined") return false;
  const mobile = window.matchMedia?.("(max-width: 1023px)")?.matches ?? false;
  return mobile && isStaffMobileTabKeepAliveEnabled();
}
