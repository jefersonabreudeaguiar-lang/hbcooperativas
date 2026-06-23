"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppData } from "@/hooks/useAppData";
import { canUser, canGerenciarEquipe, getUserFuncaoLabel } from "@/permissions";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { Action, Resource } from "@/types";

export function usePermissions() {
  const { user } = useAuth();
  const data = useAppData();

  const check = (resource: Resource, action: Action) => {
    if (!user) return false;
    return canUser(user, resource, action);
  };

  const isCooperado = user?.role === "cooperado";
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const cooperadoId =
    user?.cooperadoId && data
      ? resolverCooperadoIdCanonico(data, user.cooperadoId, coopId)
      : user?.cooperadoId;
  const podeGerenciarEquipe = user ? canGerenciarEquipe(user) : false;
  const funcaoLabel = user ? getUserFuncaoLabel(user) : "";

  return { user, check, isCooperado, cooperadoId, coopId, podeGerenciarEquipe, funcaoLabel };
}
