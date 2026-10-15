"use client";

import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { CooperadoAtualizarButton } from "@/components/sync/SyncStatusChip";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useCooperadoPwaDadosDesatualizados } from "@/hooks/useCooperadoPwaDadosDesatualizados";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { cooperadoPostDeployDegraded } from "@/lib/cooperado/cooperadoPostDeploySession";

/**
 * Versão do bundle no celular do cooperado + Atualizar sutil (snapshots A receber / Financeiro).
 */
export function CooperadoMobileBuildBadge() {
  const { user } = useAuth();
  const dadosDesatualizados = useCooperadoPwaDadosDesatualizados(user);
  const { syncingForUi } = useSyncStatus();
  const showStaleBadge = dadosDesatualizados && !syncingForUi;
  const degraded = user?.role === "cooperado" && cooperadoPostDeployDegraded();

  return (
    <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Versão e atualização">
      <span
        className="rounded-md bg-green-800/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-green-50"
        title={`Versão do app: ${APP_BUILD_VERSION}`}
        aria-label={`Versão ${APP_BUILD_VERSION}`}
      >
        v{APP_BUILD_VERSION}
      </span>
      {degraded && (
        <span
          className="rounded-md bg-amber-400/95 px-1 py-0.5 text-[9px] font-semibold text-amber-950"
          title="Sincronização em segundo plano — toque Atualizar"
        >
          sync…
        </span>
      )}
      {showStaleBadge && (
        <span
          className="max-w-[5.5rem] truncate rounded-md bg-amber-500/95 px-1 py-0.5 text-[9px] font-semibold leading-tight text-amber-950"
          title="Há dados mais recentes na cooperativa — toque Atualizar ou aguarde a sincronização"
        >
          desatualizado
        </span>
      )}
      <CooperadoAtualizarButton variant="header" showLoveMessage />
    </div>
  );
}
