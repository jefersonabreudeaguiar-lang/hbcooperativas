import type { User } from "@/types";
import { H197_ORLANDO_COOPERADO_ID } from "@/lib/diagnostic/h197PairedCapture";
import { isCooperadoAppUser, resolveAppUserRole } from "@/permissions";
import { resolveExperienceUser } from "@/lib/mobileExperience";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

/** Homolog UX — somente sessão cooperado Orlando (PWA de referência). */
export function canUseRqlPerfHomologPanel(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user) return false;
  const data = isAppDataWarm() ? getData() : null;
  const effective = resolveExperienceUser(user, data) ?? user;
  if (!isCooperadoAppUser(effective) && resolveAppUserRole(effective, data) !== "cooperado") {
    return false;
  }
  const cooperadoId = effective.cooperadoId;
  if (!cooperadoId) return false;
  const coopId = (data ? getUserCooperativaId(effective, data) : null) ?? effective.cooperativaId;
  if (!coopId) return false;
  const canon = data ? resolverCooperadoIdCanonico(data, cooperadoId, coopId) : cooperadoId;
  return canon === H197_ORLANDO_COOPERADO_ID;
}
