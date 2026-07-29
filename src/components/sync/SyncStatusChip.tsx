"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { cn } from "@/utils/format";

function formatRelativo(msAgo: number): string {
  if (msAgo < 15_000) return "agora";
  if (msAgo < 60_000) return `há ${Math.floor(msAgo / 1000)}s`;
  if (msAgo < 3_600_000) return `há ${Math.floor(msAgo / 60_000)} min`;
  if (msAgo < 86_400_000) return `há ${Math.floor(msAgo / 3_600_000)} h`;
  return "há mais de 1 dia";
}

/** Chip discreto: “Atualizando…” / “Atualizado há…” — reduz ansiedade de sync invisível. */
export function SyncStatusChip({ className }: { className?: string }) {
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
          "inline-flex items-center gap-1.5 rounded-full bg-green-800/80 text-green-100 px-2.5 py-1 text-[11px] font-medium",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <RefreshCw size={12} className="animate-spin shrink-0" aria-hidden />
        Atualizando…
      </span>
    );
  }

  if (!lastSyncedAt) return null;

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
    </span>
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
    </span>
  );
}
