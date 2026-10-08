"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useAppDataSelector } from "@/hooks/useAppData";
import { RqlPerfHomologSheet } from "@/components/performance/RqlPerfHomologSheet";
import { canUseRqlPerfHomologPanel } from "@/lib/performance/rqlPerfHomologAccess";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { useAuth } from "@/modules/auth/AuthProvider";
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
const LONG_PRESS_MS = 850;

export function AppMobileReleaseBar({ variant }: { variant: Variant }) {
  const { user } = useAuth();
  useAppDataSelector((d) => d?.cooperados?.length ?? 0, [user?.id, user?.cooperadoId]);
  const homologOrlando = variant === "cooperado" && canUseRqlPerfHomologPanel(user);
  const { syncing, lastSyncedAt } = useSyncStatus();
  const [, setTick] = useState(0);
  const [homologOpen, setHomologOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const s = STYLES[variant];

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openHomolog = () => setHomologOpen(true);

  const startLongPress = () => {
    if (!homologOrlando) return;
    clearLongPress();
    longPressTimer.current = setTimeout(openHomolog, LONG_PRESS_MS);
  };

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
          : "busque dados da nuvem — toque Atualizar";

  const Atualizar = variant === "cooperado" ? CooperadoAtualizarButton : StaffAtualizarButton;

  return (
    <>
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
              homologOrlando && "select-none touch-manipulation",
              s.badge
            )}
            title={homologOrlando ? "Segure ~1s para medição de performance (homolog)" : undefined}
            onPointerDown={homologOrlando ? startLongPress : undefined}
            onPointerUp={homologOrlando ? clearLongPress : undefined}
            onPointerCancel={homologOrlando ? clearLongPress : undefined}
            onPointerLeave={homologOrlando ? clearLongPress : undefined}
            onContextMenu={
              homologOrlando
                ? (e) => {
                    e.preventDefault();
                    openHomolog();
                  }
                : undefined
            }
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
    {homologOrlando && (
      <RqlPerfHomologSheet open={homologOpen} onClose={() => setHomologOpen(false)} />
    )}
    </>
  );
}
