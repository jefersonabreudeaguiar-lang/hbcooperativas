import { getSession } from "@/services/dataStore";
import { isStaffRole } from "@/lib/security/staffAccessPolicy";
import type { UserRole } from "@/types";
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";
import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";

function staffSessionActive(): boolean {
  const session = getSession();
  if (!session?.role) return false;
  return isStaffRole(session.role as UserRole);
}

/** Sync automático / stats do painel — não competir com a troca de aba. */
export function staffGestaoPausaTrabalhoPesadoAutomatico(): boolean {
  if (!staffSessionActive()) return false;
  if (!isStaffMobileViewportActive()) return false;
  return staffTabSwitchQuiescenceActive();
}
