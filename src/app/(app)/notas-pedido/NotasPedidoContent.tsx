"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { usePermissions } from "@/hooks/usePermissions";

const NotasPedidoStaffMain = dynamic(() => import("./NotasPedidoStaffMain"), {
  loading: () => <PageSkeleton compact />,
});

const NotasPedidoCooperadoMain = dynamic(() => import("./NotasPedidoCooperadoMain"), {
  loading: () => <PageSkeleton compact />,
});

/** RQL 8.6 P1 — chunks separados cooperado vs responsável (conferência). */
export default function NotasPedidoContent() {
  const { isCooperado, user } = usePermissions();
  if (!user) return <PageSkeleton compact />;
  return isCooperado ? <NotasPedidoCooperadoMain /> : <NotasPedidoStaffMain />;
}
