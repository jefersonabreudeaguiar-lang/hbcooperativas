/**
 * Leitura leve da sessão staff — sem importar dataStore (evita ciclo com pagamentoIntegridade).
 */
import type { UserRole } from "@/types";
import { isStaffRole } from "@/lib/security/staffAccessPolicy";

const SESSION_KEY = "coopeagriplla_session";

export function isStaffSessionActiveInStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { role?: UserRole };
    const role = parsed?.role;
    return Boolean(role && isStaffRole(role));
  } catch {
    return false;
  }
}
