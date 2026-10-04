"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { CooperadoAtualizarButton } from "@/components/sync/SyncStatusChip";
import { cn } from "@/utils/format";

function formatRelativo(msAgo: number): string {
  if (msAgo < 15_000) return "agora";
  if (msAgo < 60_000) return `há ${Math.floor(msAgo / 1000)}s`;
  if (msAgo < 3_600_000) return `há ${Math.floor(msAgo / 60_000)} min`;
  if (msAgo < 86_400_000) return `há ${Math.floor(msAgo / 3_600_000)} h`;
  return "há mais de 1 dia";
}

/** Faixa fixa acima das abas — build do app + última sync de dados. */
export function CooperadoMobileReleaseBar() {
  const { syncing, lastSyncedAt } = useSyncStatus();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (syncing || !lastSyncedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 20_000);
    return () => window.clearInterval(id);
  }, [syncing, lastSyncedAt]);

  const dadosLabel =
    syncing ? "atualizando dados…" : lastSyncedAt ? `dados ${formatRelativo(Date.now() - lastSyncedAt)}` : "dados ainda não sincronizados";

  return (
    <div
      className="flex items-center justify-between gap-2 border-t border-green-100 bg-green-50/95 px-3 py-1.5 text-[10px] sm:text-[11px] text-green-900 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
        <span className="shrink-0 rounded-md bg-green-800 px-1.5 py-0.5 font-bold tabular-nums text-white">
          v{APP_BUILD_VERSION}
        </span>
        <span className="truncate text-green-800/90">
          {syncing ? (
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={11} className="animate-spin shrink-0" aria-hidden />
              {dadosLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Check size={11} className="shrink-0 text-green-700" aria-hidden />
              Última atualização · {dadosLabel}
            </span>
          )}
        </span>
      </div>
      <CooperadoAtualizarButton
        className={cn(
          "shrink-0 rounded-md bg-green-800/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-green-900"
        )}
      />
    </div>
  );
}
