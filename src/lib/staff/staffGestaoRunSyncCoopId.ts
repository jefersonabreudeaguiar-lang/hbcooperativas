import type { AppData, User } from "@/types";
import { getUserCooperativaId, resolveGestaoCooperativaId } from "@/utils/cooperativa";
import { isStaffGestaoRole } from "@/lib/staff/staffResponsavelSyncPolicy";

/** Cooperativa usada no runSync — gestão enxerga CNPJ / catálogo local, não só JWT. */
export function resolveRunSyncCooperativaId(
  user: Omit<User, "password">,
  data: AppData
): string | undefined {
  if (isStaffGestaoRole(user.role)) {
    return resolveGestaoCooperativaId(user, data);
  }
  return getUserCooperativaId(user, data);
}
