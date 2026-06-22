"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { canUser, canGerenciarEquipe, getUserFuncaoLabel } from "@/permissions";
import type { Action, Resource } from "@/types";

export function usePermissions() {
  const { user } = useAuth();

  const check = (resource: Resource, action: Action) => {
    if (!user) return false;
    return canUser(user, resource, action);
  };

  const isCooperado = user?.role === "cooperado";
  const cooperadoId = user?.cooperadoId;
  const podeGerenciarEquipe = user ? canGerenciarEquipe(user) : false;
  const funcaoLabel = user ? getUserFuncaoLabel(user) : "";

  return { user, check, isCooperado, cooperadoId, podeGerenciarEquipe, funcaoLabel };
}
