"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  CooperadoAtualizarButton,
  StaffAtualizarButton,
} from "@/components/sync/SyncStatusChip";
import { cn } from "@/utils/format";
import {
  formatRelativoSync,
  staffUltimaAtualizacaoTexto,
} from "@/components/sync/staffSyncStatusText";

type Variant = "cooperado" | "staff";

const STYLES: Record<
  Variant,
  { wrap: string; badge: string; text: string; btn: string }
> = {
  cooperado: {
    wrap: "border-t border-green-100 bg-green-50/95 text-green-900",
    badge: "bg-green-800 text-white",
    text: "text-green-800/90",
    btn: "bg-green-800/90 hover:bg-green-900",
  },
  staff: {
    wrap: "border-t border-indigo-100 bg-indigo-50/95 text-indigo-950",
    badge: "bg-indigo-800 text-white",
    text: "text-indigo-900/90",
    btn: "bg-indigo-800/90 hover:bg-indigo-900",
  },
};

/** Faixa fixa — build do app no navegador + última sync (cooperado ou responsável). */
export function AppMobileReleaseBar({ variant }: { variant: Variant }) {
  const { syncing, lastSyncedAt } = useSyncStatus();
  const [, setTick] = useState(0);
  const s = STYLES[variant];

  useEffect(() => {
    if (syncing || !lastSyncedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 20_000);
    return () => window.clearInterval(id);
  }, [syncing, lastSyncedAt]);

  const dadosLabel =
    variant === "staff"
      ? staffUltimaAtualizacaoTexto(syncing, lastSyncedAt)
      : syncing
        ? "atualizando dados…"
        : lastSyncedAt
          ? `dados ${formatRelativoSync(Date.now() - lastSyncedAt)}`
          : "dados ainda não sincronizados";

  const Atualizar = variant === "cooperado" ? CooperadoAtualizarButton : StaffAtualizarButton;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] sm:text-[11px] backdrop-blur-sm safe-area-pb",
        s.wrap
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
        {variant === "cooperado" && (
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 font-bold tabular-nums",
              s.badge
            )}
          >
            v{APP_BUILD_VERSION}
          </span>
        )}
        <span className={cn("truncate", s.text)}>
          {syncing ? (
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={11} className="animate-spin shrink-0" aria-hidden />
              {dadosLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Check size={11} className="shrink-0 opacity-80" aria-hidden />
              {variant === "staff"
                ? dadosLabel
                : `Última atualização · ${dadosLabel}`}
            </span>
          )}
        </span>
      </div>
      <Atualizar
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold text-white",
          s.btn
        )}
      />
    </div>
  );
}
