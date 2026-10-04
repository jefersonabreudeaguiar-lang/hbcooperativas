"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { isCooperadoEventDrivenSync } from "@/lib/performance/cooperadoEventDrivenSync";
import {
  requestAppSyncImmediate,
  requestCooperadoManualRefreshSync,
} from "@/services/syncRequest";
import { cn } from "@/utils/format";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

function formatRelativo(msAgo: number): string {
  if (msAgo < 15_000) return "agora";
  if (msAgo < 60_000) return `há ${Math.floor(msAgo / 1000)}s`;
  if (msAgo < 3_600_000) return `há ${Math.floor(msAgo / 60_000)} min`;
  if (msAgo < 86_400_000) return `há ${Math.floor(msAgo / 3_600_000)} h`;
  return "há mais de 1 dia";
}

/** Chip discreto: “Atualizando…” / “Atualizado há…” — reduz ansiedade de sync invisível. */
export function SyncStatusChip({
  className,
  showBuild = false,
}: {
  className?: string;
  showBuild?: boolean;
}) {
  const { syncing, lastSyncedAt } = useSyncStatus();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (syncing || !lastSyncedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [syncing, lastSyncedAt]);

  const buildSuffix = showBuild ? (
    <span className="text-green-200/80 font-normal">· v{APP_BUILD_VERSION}</span>
  ) : null;

  if (syncing) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-green-800/80 text-green-100 px-2.5 py-1 text-[11px] font-medium",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <RefreshCw size={12} className="animate-spin shrink-0" aria-hidden />
        Atualizando…
        {buildSuffix}
      </span>
    );
  }

  if (!lastSyncedAt) {
    if (!showBuild) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-green-800/50 text-green-200 px-2 py-1 text-[11px] font-medium tabular-nums",
          className
        )}
        role="status"
      >
        v{APP_BUILD_VERSION}
      </span>
    );
  }

  const label = formatRelativo(Date.now() - lastSyncedAt);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-green-800/50 text-green-200 px-2.5 py-1 text-[11px] font-medium",
        className
      )}
      title={`Última sincronização: ${new Date(lastSyncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
      role="status"
    >
      <Check size={12} className="shrink-0 opacity-80" aria-hidden />
      Atualizado {label}
      {buildSuffix}
    </span>
  );
}

/** Responsável / staff — sync completo ao toque. */
export function StaffAtualizarButton({ className }: { className?: string }) {
  const { lastSyncedAt, syncing } = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef(0);
  const spinning = busy || syncing;

  useEffect(() => {
    if (!busy) return;
    if (!syncing && lastSyncedAt != null && lastSyncedAt >= startedAtRef.current) {
      setBusy(false);
      return;
    }
    const id = window.setTimeout(() => setBusy(false), 90_000);
    return () => window.clearTimeout(id);
  }, [busy, lastSyncedAt, syncing]);

  return (
    <button
      type="button"
      onClick={() => {
        if (busy || syncing) return;
        startedAtRef.current = Date.now();
        setBusy(true);
        requestAppSyncImmediate();
      }}
      disabled={spinning}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        "disabled:opacity-70",
        className
      )}
      aria-busy={spinning}
      aria-label={spinning ? "Atualizando dados" : "Atualizar dados da cooperativa"}
    >
      <RefreshCw size={12} className={cn("shrink-0", spinning && "animate-spin")} aria-hidden />
      Atualizar
    </button>
  );
}

/** Cooperado — sync operacional só ao toque; busy local (não pisca com sync em background). */
export function CooperadoAtualizarButton({ className }: { className?: string }) {
  const { lastSyncedAt, syncing } = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef(0);
  const spinning = busy || syncing;

  useEffect(() => {
    if (!busy) return;
    if (!syncing && lastSyncedAt != null && lastSyncedAt >= startedAtRef.current) {
      setBusy(false);
      return;
    }
    const id = window.setTimeout(() => setBusy(false), 50_000);
    return () => window.clearTimeout(id);
  }, [busy, lastSyncedAt, syncing]);

  return (
    <button
      type="button"
      onClick={() => {
        if (busy || syncing) return;
        startedAtRef.current = Date.now();
        setBusy(true);
        if (isCooperadoEventDrivenSync()) {
          requestCooperadoManualRefreshSync();
        } else {
          requestAppSyncImmediate();
        }
      }}
      disabled={spinning}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        "text-green-100/95 hover:bg-green-800/90 disabled:opacity-70",
        className
      )}
      aria-busy={spinning}
      aria-label={spinning ? "Atualizando dados" : "Atualizar dados da cooperativa"}
    >
      <RefreshCw size={12} className={cn("shrink-0", spinning && "animate-spin")} aria-hidden />
      Atualizar
    </button>
  );
}

/** Variante para fundo claro (topo do main no desktop). */
export function SyncStatusChipLight({ className }: { className?: string }) {
  const { syncing, lastSyncedAt } = useSyncStatus();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (syncing || !lastSyncedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [syncing, lastSyncedAt]);

  if (syncing) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 text-[11px] font-medium",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <RefreshCw size={12} className="animate-spin shrink-0" aria-hidden />
        Atualizando dados…
      </span>
    );
  }

  if (!lastSyncedAt) return null;

  const label = formatRelativo(Date.now() - lastSyncedAt);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 text-[11px] font-medium",
        className
      )}
      title={`Última sincronização: ${new Date(lastSyncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
      role="status"
    >
      <Check size={12} className="shrink-0 text-green-700" aria-hidden />
      Atualizado {label}
      <span className="text-gray-400 font-normal">· v{APP_BUILD_VERSION}</span>
    </span>
  );
}
