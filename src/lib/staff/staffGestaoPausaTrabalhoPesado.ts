import { getSession } from "@/services/dataStore";
import { isStaffRole } from "@/lib/security/staffAccessPolicy";
import type { UserRole } from "@/types";
import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";

function staffSessionActive(): boolean {
  const session = getSession();
  if (!session?.role) return false;
  return isStaffRole(session.role as UserRole);
}

/** Sync automático / stats do painel — não competir com a troca de aba (PC e celular). */
export function staffGestaoPausaTrabalhoPesadoAutomatico(): boolean {
  if (!staffSessionActive()) return false;
  return staffTabSwitchQuiescenceActive();
}
