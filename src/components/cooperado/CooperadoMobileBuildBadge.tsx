"use client";

import { useEffect, useState } from "react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { CooperadoAtualizarButton } from "@/components/sync/SyncStatusChip";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useCooperadoPwaDadosDesatualizados } from "@/hooks/useCooperadoPwaDadosDesatualizados";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { cooperadoPostDeployDegraded } from "@/lib/cooperado/cooperadoPostDeploySession";
import { fetchOfficialClientRelease } from "@/lib/pwa/fetchOfficialClientRelease";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";
import { clearCooperadoPwaDadosDesatualizados } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { rematerializarCooperadoPwaSnapshotsSeNecessario } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";

/**
 * Versão do bundle no celular do cooperado + Atualizar sutil (snapshots A receber / Financeiro).
 */
export function CooperadoMobileBuildBadge() {
  const { user } = useAuth();
  const dadosDesatualizados = useCooperadoPwaDadosDesatualizados(user);
  const { syncingForUi } = useSyncStatus();
  const showStaleBadge = dadosDesatualizados && !syncingForUi;
  const degraded = user?.role === "cooperado" && cooperadoPostDeployDegraded();
  const [cloudBuild, setCloudBuild] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role !== "cooperado") return;
    if (rematerializarCooperadoPwaSnapshotsSeNecessario(user)) {
      clearCooperadoPwaDadosDesatualizados();
    }
    let cancelled = false;
    void fetchOfficialClientRelease({ bypassCache: true }).then((info) => {
      if (cancelled || !info) return;
      setCloudBuild(info.build);
      if (info.build > APP_BUILD_VERSION) {
        void runClientReleaseShield("cooperado_build_behind_cloud");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.role, user?.id]);

  const bundleBehindCloud = cloudBuild != null && cloudBuild > APP_BUILD_VERSION;

  return (
    <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Versão e atualização">
      <span
        className={
          bundleBehindCloud
            ? "rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
            : "rounded-md bg-green-800/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-green-50"
        }
        title={
          bundleBehindCloud
            ? `Seu app: v${APP_BUILD_VERSION} · Produção: v${cloudBuild} — toque Atualizar`
            : cloudBuild != null
              ? `App v${APP_BUILD_VERSION} (nuvem v${cloudBuild})`
              : `Versão do app: ${APP_BUILD_VERSION}`
        }
        aria-label={`Versão ${APP_BUILD_VERSION}`}
      >
        {bundleBehindCloud ? `v${APP_BUILD_VERSION}→${cloudBuild}` : `v${APP_BUILD_VERSION}`}
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
