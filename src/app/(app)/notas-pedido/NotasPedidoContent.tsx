"use client";

import dynamic from "next/dynamic";
import { RouteChunkLoadingShell } from "@/lib/performance/appRouteLazy";
import { usePermissions } from "@/hooks/usePermissions";

const NotasPedidoStaffMain = dynamic(() => import("./staff/NotasPedidoStaffResponsavelEntry"), {
  loading: () => <RouteChunkLoadingShell />,
});

const NotasPedidoCooperadoMain = dynamic(() => import("./NotasPedidoCooperadoMain"), {
  loading: () => <RouteChunkLoadingShell />,
});

/** RQL 8.6 P1 — chunks separados cooperado vs responsável (conferência). */
export default function NotasPedidoContent() {
  const { isCooperado, user } = usePermissions();
  if (!user) return <RouteChunkLoadingShell />;
  return isCooperado ? <NotasPedidoCooperadoMain /> : <NotasPedidoStaffMain />;
}
