"use client";

import dynamic from "next/dynamic";
import { RouteChunkLoadingShell } from "@/lib/performance/appRouteLazy";

/**
 * Entry leve — corpo da gestão (fila/conferir) em chunk separado (`NotasPedidoStaffResponsavelApp`).
 */
const NotasPedidoStaffResponsavelApp = dynamic(
  () => import("./NotasPedidoStaffResponsavelApp"),
  { loading: () => <RouteChunkLoadingShell /> }
);

export default function NotasPedidoStaffResponsavelEntry() {
  return <NotasPedidoStaffResponsavelApp />;
}
