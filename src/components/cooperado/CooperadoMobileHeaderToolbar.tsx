"use client";

import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { CooperadoAtualizarButton } from "@/components/sync/SyncStatusChip";

/** Cooperado mobile — build + Atualizar no topo, ao lado do menu. */
export function CooperadoMobileHeaderToolbar() {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span
        className="rounded-md bg-green-800 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
        aria-label={`Versão do app ${APP_BUILD_VERSION}`}
      >
        v{APP_BUILD_VERSION}
      </span>
      <CooperadoAtualizarButton className="!rounded-md !px-2 !py-1 !text-[10px] !font-semibold !text-white !bg-green-800/90 hover:!bg-green-950" />
    </div>
  );
}
