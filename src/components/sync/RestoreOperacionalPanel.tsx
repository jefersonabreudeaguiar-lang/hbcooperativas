"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudDownload, RefreshCw } from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { useAppDataSelector } from "@/hooks/useAppData";
import { getData } from "@/services/dataStore";
import {
  forceRestoreOperacionalFromCloud,
  medirOperacionalLocalVsNuvem,
  type OperacionalAlinhamentoStats,
} from "@/services/operacionalRestoreService";
import { secureApiFetch } from "@/lib/security/clientSession";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

type Props = {
  cnpj: string;
  coopId: string;
  compact?: boolean;
};

async function fetchOperacional(cnpj: string): Promise<OperacionalSyncPayload | null> {
  try {
    const res = await secureApiFetch(`/api/cooperativa-sync?cnpj=${cnpj}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { operacional?: OperacionalSyncPayload | null };
    return json.operacional ?? null;
  } catch {
    return null;
  }
}

export function RestoreOperacionalPanel({ cnpj, coopId, compact }: Props) {
  const [cloudOp, setCloudOp] = useState<OperacionalSyncPayload | null>(null);
  const [stats, setStats] = useState<OperacionalAlinhamentoStats | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState<boolean | null>(null);

  const localRevision = useAppDataSelector(
    (data) =>
      data
        ? `${data.pagamentosCooperado.length}-${data.fichaCorrida.length}-${data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId && p.status === "aguardando_confirmacao").length}`
        : "",
    [coopId]
  );

  const refreshCloudStats = useCallback(async () => {
    setLoadingCloud(true);
    const op = await fetchOperacional(cnpj);
    setCloudOp(op);
    setStats(medirOperacionalLocalVsNuvem(getData(), coopId, op));
    setLoadingCloud(false);
  }, [cnpj, coopId]);

  useEffect(() => {
    void refreshCloudStats();
  }, [refreshCloudStats, localRevision]);

  const onRestore = async () => {
    setRestoring(true);
    setResultMsg(null);
    setResultOk(null);
    const result = await forceRestoreOperacionalFromCloud(cnpj, coopId);
    setResultOk(result.ok);
    setResultMsg(result.message);
    setStats(result.stats);
    setRestoring(false);
    if (!result.ok) {
      await refreshCloudStats();
    }
  };

  if (loadingCloud && !stats) return null;

  const restoreAtivo = stats?.cloudFullReset === true;
  const showPanel = restoreAtivo && (stats?.desalinhado || resultMsg);

  if (!restoreAtivo && !resultMsg) return null;
  if (!showPanel && !resultMsg && compact) return null;

  return (
    <AlertBanner
      variant={resultOk === false ? "error" : stats?.desalinhado ? "warning" : "success"}
      title={
        stats?.desalinhado
          ? "Este aparelho ainda não está igual à nuvem (backup)"
          : "Financeiro alinhado à nuvem"
      }
    >
      <div className="space-y-2 text-sm">
        {stats && (
          <p>
            Nuvem (backup): <strong>{stats.cloudAguardandoAssinatura}</strong> aguardando assinatura ·{" "}
            {stats.cloudPagamentos} pagamentos · {stats.cloudFichas} fichas (reset v{stats.cloudResetVersion})
            <br />
            Neste aparelho: <strong>{stats.localAguardandoAssinatura}</strong> aguardando · {stats.localPagamentos}{" "}
            pagamentos · {stats.localFichas} fichas · app build {APP_BUILD_VERSION}
          </p>
        )}
        {resultMsg && <p className={resultOk ? "text-emerald-800 font-medium" : "text-red-800 font-medium"}>{resultMsg}</p>}
        {stats?.desalinhado && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="primary"
              disabled={restoring}
              onClick={() => void onRestore()}
              className="inline-flex items-center gap-1.5"
            >
              {restoring ? <RefreshCw size={14} className="animate-spin" /> : <CloudDownload size={14} />}
              {restoring ? "Restaurando…" : "Restaurar da nuvem agora"}
            </Button>
            <Button size="sm" variant="secondary" disabled={restoring} onClick={() => void refreshCloudStats()}>
              Conferir de novo
            </Button>
          </div>
        )}
        {stats?.desalinhado && (
          <p className="text-xs opacity-90">
            Se continuar diferente: no Chrome, Configurações do site → Limpar dados → só este site → recarregue e toque
            em Restaurar de novo.
          </p>
        )}
      </div>
    </AlertBanner>
  );
}
