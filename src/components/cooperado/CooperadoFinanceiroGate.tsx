"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  cooperadoFinanceiroLocalAusente,
  cooperadoTemDadosFinanceirosMinimos,
  limparFichaObsoletaCooperado,
} from "@/services/fichaSyncGuard";
import { solicitarRecuperacaoFinanceiroCooperado } from "@/services/cooperadoFinanceiroGuard";
import { requestAppSyncImmediate } from "@/services/syncRequest";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getData, saveDataSafe } from "@/services/dataStore";
import {
  getCooperadoRunSyncSessionLease,
  saveAppDataIfSyncLeaseCurrent,
} from "@/services/operacionalPullLease";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";

/** Bloqueio máximo da tela cheia; sync segue em background depois disso. */
const SYNC_BLOCK_MAX_MS = 18_000;

/**
 * Cooperado: sync financeiro na nuvem sem prender o app por minutos.
 * Só ocupa a tela inteira quando não há dados locais; caso contrário, banner + navegação.
 */
export function CooperadoFinanceiroGate({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { syncing, syncInProgress, lastSyncError, lastSyncedAt } = useSyncStatus();
  const [syncWaitExceeded, setSyncWaitExceeded] = useState(false);

  const financeiro = useAppDataSelector((data) => {
    if (!data || !user?.cooperadoId || user.role !== "cooperado") {
      return { bloqueiaEntrada: false, desatualizado: false };
    }
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return { bloqueiaEntrada: true, desatualizado: true };
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    const financeiroAusente = cooperadoFinanceiroLocalAusente(data, cooperadoId, coopId);
    const bloqueiaEntrada =
      financeiroAusente && !cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId);
    return {
      bloqueiaEntrada,
      // O aviso usa apenas uma consulta local do cooperado. Reconciliação de
      // valores desalinhados fica no sync em background, fora da renderização.
      desatualizado: financeiroAusente,
    };
  }, [user?.id, user?.cooperadoId, user?.cooperativaId, user?.role]);
  const bloqueiaEntrada = financeiro?.bloqueiaEntrada ?? false;
  const financeiroDesatualizado = financeiro?.desatualizado ?? false;

  useEffect(() => {
    if (user?.role !== "cooperado" || !user.cooperadoId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const data = getData();
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    const limpo = limparFichaObsoletaCooperado(data, cooperadoId, coopId);
    if (limpo !== data) {
      saveAppDataIfSyncLeaseCurrent(getCooperadoRunSyncSessionLease() ?? undefined, limpo);
    }
    solicitarRecuperacaoFinanceiroCooperado();
    requestAppSyncImmediate();
  }, [user?.id, user?.cooperadoId, user?.role]);

  useEffect(() => {
    if (user?.role !== "cooperado") {
      setSyncWaitExceeded(false);
      return;
    }
    if (!bloqueiaEntrada || lastSyncedAt != null) {
      setSyncWaitExceeded(false);
      return;
    }
    const timer = window.setTimeout(() => setSyncWaitExceeded(true), SYNC_BLOCK_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [user?.role, bloqueiaEntrada, lastSyncedAt, user?.id]);

  if (!user || user.role !== "cooperado") {
    return <>{children}</>;
  }

  const carregandoFinanceiro =
    bloqueiaEntrada &&
    !syncWaitExceeded &&
    (syncInProgress || syncing || lastSyncedAt == null);

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
    bloqueiaEntrada &&
    (syncWaitExceeded ||
      ((!syncInProgress && !syncing) &&
        (Boolean(lastSyncError) || lastSyncedAt != null)));

  if (falhaCarregarFicha) {
    return (
      <div className="max-w-lg mx-auto py-8 space-y-4">
        <AlertBanner variant="error" title="Não foi possível carregar sua ficha">
          {lastSyncError ||
            (syncInProgress || syncing
              ? "A sincronização ainda está em andamento, mas está demorando além do esperado. Você pode aguardar ou sair e entrar novamente."
              : "A sincronização demorou demais. Toque em Tentar novamente. Se persistir, saia e entre de novo.")}
        </AlertBanner>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              solicitarRecuperacaoFinanceiroCooperado();
              requestAppSyncImmediate();
            }}
            disabled={syncing || syncInProgress}
          >
            {syncing || syncInProgress ? "Sincronização em andamento…" : "Tentar novamente"}
          </Button>
          <Button variant="secondary" onClick={() => logout()}>
            Sair e entrar de novo
          </Button>
        </div>
      </div>
    );
  }

  const bannerAtualizando =
    financeiroDesatualizado && (syncing || lastSyncedAt == null || Boolean(lastSyncError));

  return (
    <>
      {bannerAtualizando && (
        <div className="max-w-lg mx-auto px-4 pt-2">
          <AlertBanner variant="info" title="Atualizando seus dados">
            {syncing
              ? "Baixando ficha e entregas da nuvem. Os valores podem ajustar em instantes."
              : lastSyncError
                ? "Última sincronização falhou; exibindo o que há no aparelho. Toque em sincronizar se algo faltar."
                : "Preparando sua ficha e entregas…"}
          </AlertBanner>
        </div>
      )}
      {children}
    </>
  );
}
