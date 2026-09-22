"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { cooperadoFinanceiroLocalAusente, limparFichaObsoletaCooperado } from "@/services/fichaSyncGuard";
import { solicitarRecuperacaoFinanceiroCooperado } from "@/services/cooperadoFinanceiroGuard";
import { requestAppSyncImmediate } from "@/services/syncRequest";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getData, saveDataSafe } from "@/services/dataStore";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";

/** Deve ser maior que SYNC_TIMEOUT_MS do CooperativaSyncProvider (90s). */
const SYNC_WAIT_MS = 95_000;

/**
 * Cooperado só vê o app após a 1ª tentativa de baixar ficha/notas da nuvem.
 * Impede tela vazia silenciosa quando sync falha ou ainda não rodou.
 */
export function CooperadoFinanceiroGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { syncing, lastSyncError, lastSyncedAt } = useSyncStatus();
  const [syncWaitExceeded, setSyncWaitExceeded] = useState(false);

  const financeiroIncompleto = useAppDataSelector((data) => {
    if (!data || !user?.cooperadoId || user.role !== "cooperado") return false;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return true;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    return cooperadoFinanceiroLocalAusente(data, cooperadoId, coopId);
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, user?.role]);

  useEffect(() => {
    if (user?.role !== "cooperado" || !user.cooperadoId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const data = getData();
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    const limpo = limparFichaObsoletaCooperado(data, cooperadoId, coopId);
    if (limpo !== data) saveDataSafe(limpo);
    solicitarRecuperacaoFinanceiroCooperado();
  }, [user?.id, user?.cooperadoId, user?.role]);

  useEffect(() => {
    if (user?.role !== "cooperado") {
      setSyncWaitExceeded(false);
      return;
    }
    if (lastSyncedAt != null) {
      setSyncWaitExceeded(false);
      return;
    }
    const timer = window.setTimeout(() => setSyncWaitExceeded(true), SYNC_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [user?.role, lastSyncedAt, user?.id]);

  if (!user || user.role !== "cooperado") {
    return <>{children}</>;
  }

  const carregandoFinanceiro =
    financeiroIncompleto &&
    (syncing || (lastSyncedAt == null && !syncWaitExceeded));

  if (carregandoFinanceiro) {
    return (
      <div className="max-w-lg mx-auto py-12 space-y-4">
        <PageSkeleton />
        <p className="text-center text-sm text-gray-600">
          Baixando sua ficha e entregas da nuvem…
        </p>
      </div>
    );
  }

  const falhaCarregarFicha =
    financeiroIncompleto &&
    !syncing &&
    (Boolean(lastSyncError) || lastSyncedAt != null || syncWaitExceeded);

  if (falhaCarregarFicha) {
    return (
      <div className="max-w-lg mx-auto py-8 space-y-4">
        <AlertBanner variant="error" title="Não foi possível carregar sua ficha">
          {lastSyncError ||
            "A sincronização demorou demais. Toque em Tentar novamente. Se persistir, saia, limpe o cache do navegador e entre de novo."}
        </AlertBanner>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              solicitarRecuperacaoFinanceiroCooperado();
              requestAppSyncImmediate();
            }}
            disabled={syncing}
          >
            {syncing ? "Baixando…" : "Tentar novamente"}
          </Button>
          <Button variant="secondary" onClick={() => logout()}>
            Sair e entrar de novo
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
