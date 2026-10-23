import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";

/** Pausa sync/pull automático logo após troca de rota/aba (gestão). */
export function staffResponsavelPausaSyncPesado(): boolean {
  return staffTabSwitchQuiescenceActive();
}
