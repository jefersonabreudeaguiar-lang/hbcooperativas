"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";

/** Evita flash de “assinar recibo” com pagamento local desatualizado antes do pull operacional. */
export function useCooperadoExibirAguardandoAssinatura(temAguardandoLocal: boolean): {
  exibirAguardandoAssinatura: boolean;
  conferindoPagamentoNuvem: boolean;
} {
  const { user } = useAuth();
  const { syncing, cooperadoPagamentosHydrated } = useSyncStatus();

  if (user?.role !== "cooperado") {
    return {
      exibirAguardandoAssinatura: temAguardandoLocal,
      conferindoPagamentoNuvem: false,
    };
  }

  const pronto = cooperadoPagamentosHydrated && !syncing;

  return {
    exibirAguardandoAssinatura: temAguardandoLocal && pronto,
    conferindoPagamentoNuvem: temAguardandoLocal && !pronto,
  };
}
