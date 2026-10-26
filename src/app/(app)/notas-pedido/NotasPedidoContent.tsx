"use client";

import dynamic from "next/dynamic";
import { RouteChunkLoadingShell } from "@/lib/performance/appRouteLazy";
import { usePermissions } from "@/hooks/usePermissions";
import { shouldRenderCooperadoJefersonRebuildShell } from "@/lib/cooperado/cooperadoJefersonRebuildPilot";
import { CooperadoJefersonRebuildTabCorpo } from "@/components/cooperado/CooperadoJefersonRebuildTabCorpo";

const NotasPedidoStaffMain = dynamic(() => import("./staff/NotasPedidoStaffResponsavelApp"), {
  loading: () => <RouteChunkLoadingShell />,
});

const NotasPedidoCooperadoMain = dynamic(() => import("./NotasPedidoCooperadoMain"), {
  loading: () => <RouteChunkLoadingShell />,
});

/** RQL 8.6 P1 — chunks separados cooperado vs responsável (conferência). */
export default function NotasPedidoContent() {
  const { isCooperado, user } = usePermissions();
  if (!user) return <RouteChunkLoadingShell />;
  if (isCooperado && shouldRenderCooperadoJefersonRebuildShell("entregas", user)) {
    return <CooperadoJefersonRebuildTabCorpo tab="entregas" user={user} />;
  }
  return isCooperado ? <NotasPedidoCooperadoMain /> : <NotasPedidoStaffMain />;
}
