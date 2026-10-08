"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { CooperadoAtualizarButton } from "@/components/sync/SyncStatusChip";
import {
  formatCooperadoReleaseDiagnosticsLine,
  readCooperadoClientReleaseDiagnostics,
  shouldPromptCooperadoReleaseReload,
  type CooperadoClientReleaseDiagnostics,
} from "@/lib/pwa/cooperadoClientReleaseDiagnostics";

/** Cooperado mobile — build (local vs nuvem) + Atualizar no topo. */
export function CooperadoMobileHeaderToolbar() {
  const [diag, setDiag] = useState<CooperadoClientReleaseDiagnostics | null>(null);

  const refreshDiag = useCallback(() => {
    void readCooperadoClientReleaseDiagnostics().then(setDiag).catch(() => setDiag(null));
  }, []);

  useEffect(() => {
    refreshDiag();
    const onVis = () => {
      if (document.visibilityState === "visible") refreshDiag();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(refreshDiag, 90_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [refreshDiag]);

  const behind = diag ? shouldPromptCooperadoReleaseReload(diag) : false;
  const label =
    diag && behind
      ? `v${diag.embeddedBuild}→${diag.canonicalBuild}`
      : `v${diag?.embeddedBuild ?? APP_BUILD_VERSION}`;

  const onBuildClick = () => {
    if (!diag) return;
    if (behind) {
      const ok = window.confirm(
        `Há versão mais nova na nuvem (${formatCooperadoReleaseDiagnosticsLine(diag)}). Recarregar o app agora?`
      );
      if (ok) window.location.reload();
      return;
    }
    void navigator.clipboard?.writeText(formatCooperadoReleaseDiagnosticsLine(diag));
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onBuildClick}
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
          behind ? "bg-amber-400 text-amber-950 animate-pulse" : "bg-green-800 text-white"
        }`}
        aria-label={
          behind
            ? `Versão local ${label}; toque para atualizar`
            : `Versão do app ${label}`
        }
        title={diag ? formatCooperadoReleaseDiagnosticsLine(diag) : undefined}
      >
        {label}
      </button>
      <CooperadoAtualizarButton className="!rounded-md !px-2 !py-1 !text-[10px] !font-semibold !text-white !bg-green-800/90 hover:!bg-green-950" />
    </div>
  );
}
