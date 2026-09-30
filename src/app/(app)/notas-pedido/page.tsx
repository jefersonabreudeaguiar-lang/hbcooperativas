import { Suspense } from "react";
import dynamic from "next/dynamic";
import { RouteLoadingFallback } from "@/components/ui/RouteLoadingFallback";

const NotasPedidoPage = dynamic(() => import("./NotasPedidoContent"), {
  loading: () => <RouteLoadingFallback label="Carregando entregas…" />,
});

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback label="Carregando entregas…" />}>
      <NotasPedidoPage />
    </Suspense>
  );
}
