"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";
import {
  cooperadoJefersonPodeMaterializarAbas,
  scheduleCooperadoJefersonMaterializarAbaAtual,
} from "@/lib/cooperado/cooperadoJefersonAbasDadosReais";

/**
 * Piloto Jeferson — ao entrar numa aba (após sync automático), grava snapshot local daquela tela em idle.
 */
export function CooperadoJefersonAbaDadosReaisLifecycle() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { lastSyncedAt } = useSyncStatus();

  useEffect(() => {
    if (!user || !isCooperadoJefersonSomenteAtualizarPilot(user)) return;
    if (!cooperadoJefersonPodeMaterializarAbas(user)) return;
    scheduleCooperadoJefersonMaterializarAbaAtual(user, pathname);
  }, [user?.id, user?.role, user?.cooperadoId, pathname, lastSyncedAt]);

  return null;
}
