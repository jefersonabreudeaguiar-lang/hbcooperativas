"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { evaluateResponsavelIdentidade } from "@/lib/responsavel/responsavelIdentidade";
import { canUser, canGerenciarEquipe, getUserFuncaoLabel, isCooperadoAppUser, isResponsavelRole } from "@/permissions";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import type { Action, Resource } from "@/types";

export function usePermissions() {
  const { user, accountUser } = useAuth();
  const authSubject = accountUser ?? user;
  const staffPainelAtivo = useAppDataSelector(
    (d) =>
      evaluateResponsavelIdentidade({
        accountUser: accountUser ?? user,
        experienceUser: user,
        data: d,
        dataReady: true,
        mobile: isMobileCooperativaApp(),
      }).staffPainelUi,
    [
      accountUser?.id,
      accountUser?.email,
      accountUser?.role,
      accountUser?.cooperadoId,
      accountUser?.cooperativaId,
      user?.id,
      user?.role,
    ]
  );
  const permUser = staffPainelAtivo ? accountUser ?? user : user;

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

  const isCooperado =
    !staffPainelAtivo && Boolean(user && (user.role === "cooperado" || isCooperadoAppUser(user)));
  const isResponsavel = staffPainelAtivo && authSubject ? isResponsavelRole(authSubject.role) : false;
  const isDiretoria = Boolean(staffPainelAtivo);
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
