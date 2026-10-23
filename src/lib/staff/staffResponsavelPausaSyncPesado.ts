import { isStaffMobileTabKeepAliveEnabled } from "@/lib/performance/staffMobileTabKeepAlive";
import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";

/** Pausa sync/pull automático logo após troca de aba (gestão, celular ou desktop). */
export function staffResponsavelPausaSyncPesado(): boolean {
  if (!staffTabSwitchQuiescenceActive()) return false;
  return isStaffMobileTabKeepAliveEnabled();
}
