"use client";

import { CooperadoAtualizarButton } from "@/components/sync/SyncStatusChip";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useCooperadoPwaFinanceiroSnapshotsAusentes } from "@/hooks/useCooperadoPwaDadosDesatualizados";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { cn } from "@/utils/format";

/** Faixa inferior só quando snapshots financeiros estão vazios (cache limpo). */
export function CooperadoMobileReleaseBar() {
  const { user } = useAuth();
  const snapshotsVazios = useCooperadoPwaFinanceiroSnapshotsAusentes(user);
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return null;
  if (!snapshotsVazios) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-t border-amber-200/90 bg-amber-50/95 px-3 py-1.5 text-[10px] text-amber-950 backdrop-blur-sm"
      )}
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0 flex-1 truncate font-medium">busque dados — Atualizar</span>
      <CooperadoAtualizarButton
        variant="header"
        className="!bg-amber-800/90 hover:!bg-amber-900 !text-amber-50"
      />
    </div>
  );
}
