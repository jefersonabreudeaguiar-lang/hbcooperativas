"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { canUser, canGerenciarEquipe, getUserFuncaoLabel } from "@/permissions";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { Action, Resource } from "@/types";

export function usePermissions() {
  const { user } = useAuth();

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
    if (!user) return false;
    return canUser(user, resource, action);
  };

  const isCooperado = user?.role === "cooperado";
  const podeGerenciarEquipe = user ? canGerenciarEquipe(user) : false;
  const funcaoLabel = user ? getUserFuncaoLabel(user) : "";

  return { user, check, isCooperado, cooperadoId, coopId, podeGerenciarEquipe, funcaoLabel };
}
