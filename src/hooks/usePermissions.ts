"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { can } from "@/permissions";
import type { Action, Resource } from "@/types";

export function usePermissions() {
  const { user } = useAuth();

  const check = (resource: Resource, action: Action) => {
    if (!user) return false;
    return can(user.role, resource, action);
  };

  const isCooperado = user?.role === "cooperado";
  const cooperadoId = user?.cooperadoId;

  return { user, check, isCooperado, cooperadoId };
}
