"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { useCooperadoReleasePolicy } from "@/hooks/useCooperadoReleasePolicy";
import {
  scheduleCooperadoPostDeployMaterializeOnSync,
  scheduleCooperadoSilentReleaseBootstrap,
} from "@/lib/cooperado/cooperadoPostDeployBackground";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";

/**
 * Cooperado: atualização pós-deploy só em segundo plano (sem tela de carregamento).
 */
export function CooperadoPostDeployGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { policy, loading, clientBuild } = useCooperadoReleasePolicy();
  const { lastSyncedAt } = useSyncStatus();
  const lastSyncedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user || user.role !== "cooperado" || loading) return;
    if (isCooperadoJefersonSomenteAtualizarPilot(user)) return;
    scheduleCooperadoSilentReleaseBootstrap(user, policy, clientBuild);
  }, [user?.id, user?.role, loading, policy, clientBuild, user]);

  useEffect(() => {
    if (!user || user.role !== "cooperado" || lastSyncedAt == null) return;
    if (isCooperadoJefersonSomenteAtualizarPilot(user)) return;
    if (lastSyncedRef.current === lastSyncedAt) return;
    lastSyncedRef.current = lastSyncedAt;
    scheduleCooperadoPostDeployMaterializeOnSync(user, policy);
  }, [user, lastSyncedAt, policy]);

  return <>{children}</>;
}
