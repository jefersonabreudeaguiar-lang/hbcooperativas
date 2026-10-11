"use client";

import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { CooperadoAtualizarButton } from "@/components/sync/SyncStatusChip";

/**
 * Versão do bundle no celular do cooperado + Atualizar sutil (snapshots A receber / Financeiro).
 */
export function CooperadoMobileBuildBadge() {
  return (
    <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Versão e atualização">
      <span
        className="rounded-md bg-green-800/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-green-50"
        title={`Versão do app: ${APP_BUILD_VERSION}`}
        aria-label={`Versão ${APP_BUILD_VERSION}`}
      >
        v{APP_BUILD_VERSION}
      </span>
      <CooperadoAtualizarButton variant="header" />
    </div>
  );
}
