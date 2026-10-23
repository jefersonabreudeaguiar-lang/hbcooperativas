"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { requestStaffGestaoAtualizar } from "@/services/syncRequest";
import { requestManualCooperadoReleaseUpgrade } from "@/lib/pwa/fetchOfficialClientRelease";
import {
  COOPERADO_ATUALIZAR_MENSAGEM_AMOR,
  executarCooperadoAtualizarManual,
} from "@/lib/cooperado/cooperadoAtualizarManual";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoPwaMaterializarSnapshotsFinanceirosPosSync } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { cn } from "@/utils/format";
import {
  formatRelativoSync,
  staffUltimaAtualizacaoTexto,
  STAFF_APP_BUILD_LABEL,
} from "@/components/sync/staffSyncStatusText";

function formatRelativo(msAgo: number): string {
  return formatRelativoSync(msAgo);
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

  if (showBuild) {
    const texto = staffUltimaAtualizacaoTexto(syncing, lastSyncedAt);
    return (
      <span
        className={cn(
          "inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full bg-green-800/50 text-green-100 px-2.5 py-1 text-[10px] sm:text-[11px] font-medium",
          syncing && "bg-green-800/80",
          className
        )}
        title={
          lastSyncedAt
            ? `Última sincronização: ${new Date(lastSyncedAt).toLocaleString("pt-BR")} · app ${STAFF_APP_BUILD_LABEL}`
            : `App ${STAFF_APP_BUILD_LABEL}`
        }
        role="status"
        aria-live="polite"
      >
        {syncing ? (
          <RefreshCw size={12} className="animate-spin shrink-0" aria-hidden />
        ) : (
          <Check size={12} className="shrink-0 opacity-80" aria-hidden />
        )}
        <span className="truncate tabular-nums">{texto}</span>
      </span>
    );
  }

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

/** Responsável / staff — pull da nuvem ao toque (sem push que zera o painel). */
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
        requestStaffGestaoAtualizar();
        void requestManualCooperadoReleaseUpgrade();
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
export function CooperadoAtualizarButton({
  className,
  variant = "default",
  showLoveMessage = false,
}: {
  className?: string;
  /** Header mobile: compacto ao lado da versão do app. */
  variant?: "default" | "header";
  /** Exibe «Jesus te ama» enquanto atualiza (ex.: header mobile). */
  showLoveMessage?: boolean;
}) {
  const { user } = useAuth();
  const { syncingForUi } = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const sawSyncUiRef = useRef(false);
  const spinning = busy || syncingForUi;
  const header = variant === "header";

  useEffect(() => {
    if (syncingForUi) sawSyncUiRef.current = true;
    if (!busy) {
      sawSyncUiRef.current = false;
      return;
    }
    if (sawSyncUiRef.current && !syncingForUi) {
      cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(user);
      setBusy(false);
      sawSyncUiRef.current = false;
      return;
    }
    const id = window.setTimeout(() => setBusy(false), 90_000);
    return () => window.clearTimeout(id);
  }, [busy, syncingForUi, user]);

  const loveVisible = showLoveMessage && spinning;

  return (
    <>
    <button
      type="button"
      onClick={() => {
        if (busy || syncingForUi) return;
        sawSyncUiRef.current = false;
        setBusy(true);
        void executarCooperadoAtualizarManual().then((ok) => {
          if (!ok) setBusy(false);
        });
      }}
      disabled={spinning}
      className={cn(
        header
          ? "inline-flex items-center gap-0.5 rounded-md bg-green-800/80 px-1.5 py-0.5 text-[10px] font-semibold text-green-50 transition-colors hover:bg-green-700/90 disabled:opacity-60"
          : "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors text-green-100/95 hover:bg-green-800/90 disabled:opacity-70",
        className
      )}
      aria-busy={spinning}
      aria-label={
        spinning
          ? "Atualizando a receber e financeiro"
          : "Atualizar a receber e financeiro da cooperativa"
      }
      title={spinning ? "Atualizando…" : "Atualizar a receber e financeiro"}
    >
      <RefreshCw size={header ? 11 : 12} className={cn("shrink-0", spinning && "animate-spin")} aria-hidden />
      {header ? null : "Atualizar"}
    </button>
    {loveVisible ? (
      <span
        className="max-w-[7rem] truncate rounded-md bg-green-950/90 px-1.5 py-0.5 text-[9px] font-medium leading-tight text-green-50"
        role="status"
        aria-live="polite"
      >
        {COOPERADO_ATUALIZAR_MENSAGEM_AMOR}
      </span>
    ) : null}
    </>
  );
}

/** Variante para fundo claro (topo do main no desktop — responsável). */
export function SyncStatusChipLight({ className }: { className?: string }) {
  const { syncing, lastSyncedAt } = useSyncStatus();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (syncing || !lastSyncedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [syncing, lastSyncedAt]);

  const texto = staffUltimaAtualizacaoTexto(syncing, lastSyncedAt);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium max-w-full",
        syncing
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-gray-100 text-gray-700 border-gray-200",
        className
      )}
      title={
        lastSyncedAt
          ? `Última sincronização: ${new Date(lastSyncedAt).toLocaleString("pt-BR")} · app ${STAFF_APP_BUILD_LABEL}`
          : `App ${STAFF_APP_BUILD_LABEL}`
      }
      role="status"
      aria-live="polite"
    >
      {syncing ? (
        <RefreshCw size={12} className="animate-spin shrink-0" aria-hidden />
      ) : (
        <Check size={12} className="shrink-0 text-green-700" aria-hidden />
      )}
      <span className="truncate tabular-nums">{texto}</span>
    </span>
  );
}

/** Rodapé do menu lateral (responsável — desktop). */
export function StaffSidebarSyncVersionLine() {
  const { syncing, lastSyncedAt } = useSyncStatus();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (syncing || !lastSyncedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 20_000);
    return () => window.clearInterval(id);
  }, [syncing, lastSyncedAt]);

  const texto = staffUltimaAtualizacaoTexto(syncing, lastSyncedAt);

  return (
    <p className="px-3 py-2 text-[10px] leading-snug text-green-300/95 tabular-nums" role="status">
      {texto}
    </p>
  );
}
