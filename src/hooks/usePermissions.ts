"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData, useAppDataSelector } from "@/hooks/useAppData";
import { shouldRenderStaffPainelUi } from "@/lib/staffNavigationUser";
import { canUser, canGerenciarEquipe, getUserFuncaoLabel, isDiretoriaRole, isResponsavelRole } from "@/permissions";
import { canAccessPainelResponsavel } from "@/lib/security/responsavelPanelAccess";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { Action, Resource } from "@/types";

export function usePermissions() {
  const { user, accountUser } = useAuth();
  const data = useAppData();
  const authSubject = accountUser ?? user;
  const permUser =
    user && accountUser && shouldRenderStaffPainelUi(accountUser, data) ? accountUser : user;

  const coopId = useAppDataSelector(
    (data) => (user ? getUserCooperativaId(user, data) : undefined),
    [user?.id, user?.cooperativaId, user?.role]
  );

  const cooperadoId = useAppDataSelector(
    (data) =>
      user?.cooperadoId
        ? resolverCooperadoIdCanonico(data, user.cooperadoId, coopId ?? undefined)
        : user?.cooperadoId,
    [user?.cooperadoId, coopId]
  );

  const check = (resource: Resource, action: Action) => {
    if (!permUser) return false;
    return canUser(permUser, resource, action);
  };

  const isCooperado = user?.role === "cooperado";
  const isResponsavel = authSubject ? isResponsavelRole(authSubject.role) : false;
  /** Responsável, tesoureiro ou admin — quem opera conferência/correções na diretoria. */
  const isDiretoria = useAppDataSelector(
    (data) =>
      Boolean(
        authSubject &&
          isDiretoriaRole(authSubject.role) &&
          canAccessPainelResponsavel(authSubject, data)
      ),
    [authSubject?.id, authSubject?.email, authSubject?.role, authSubject?.cooperadoId, authSubject?.cooperativaId]
  );
  const podeGerenciarEquipe = authSubject ? canGerenciarEquipe(authSubject) : false;
  const funcaoLabel = user ? getUserFuncaoLabel(user) : "";

  return {
    user,
    check,
    isCooperado,
    isResponsavel,
    isDiretoria,
    cooperadoId,
    coopId,
    podeGerenciarEquipe,
    funcaoLabel,
  };
}
