"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { evaluateResponsavelIdentidade } from "@/lib/responsavel/responsavelIdentidade";
import { canUser, canGerenciarEquipe, getUserFuncaoLabel, isCooperadoAppUser, isResponsavelRole } from "@/permissions";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId, resolveGestaoCooperativaId } from "@/utils/cooperativa";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import { usePainelResponsavelMobilePref } from "@/hooks/usePainelResponsavelMobilePref";
import type { Action, Resource } from "@/types";

export function usePermissions() {
  const { user, accountUser } = useAuth();
  const authSubject = accountUser ?? user;
  const preferPainel = usePainelResponsavelMobilePref();
  const mobile = isMobileCooperativaApp();
  const staffPainelAtivo = useAppDataSelector(
    (d) =>
      evaluateResponsavelIdentidade({
        accountUser: accountUser ?? user,
        experienceUser: user,
        data: d,
        dataReady: true,
        mobile,
        preferPainelResponsavel: preferPainel,
      }).staffPainelUi,
    [
      accountUser?.id,
      accountUser?.email,
      accountUser?.role,
      accountUser?.cooperadoId,
      accountUser?.cooperativaId,
      user?.id,
      user?.role,
      mobile,
      preferPainel,
    ]
  );
  const permUser = staffPainelAtivo ? accountUser ?? user : user;

  const coopId = useAppDataSelector(
    (data) =>
      staffPainelAtivo
        ? resolveGestaoCooperativaId(permUser, data)
        : permUser
          ? getUserCooperativaId(permUser, data)
          : undefined,
    [
      permUser?.id,
      permUser?.cooperativaId,
      permUser?.cooperativaCnpj,
      permUser?.cooperadoId,
      staffPainelAtivo,
    ]
  );

  const cooperadoId = useAppDataSelector(
    (data) =>
      permUser?.cooperadoId
        ? resolverCooperadoIdCanonico(data, permUser.cooperadoId, coopId ?? undefined)
        : permUser?.cooperadoId,
    [permUser?.cooperadoId, coopId]
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
  const funcaoLabel = permUser ? getUserFuncaoLabel(permUser) : "";

  return {
    user: permUser,
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
