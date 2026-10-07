import { Suspense, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

type RouteModule = { default: ComponentType };

export function RouteChunkLoadingShell() {
  return (
    <div className="min-h-[50vh] bg-gray-50">
      <PageSkeleton compact />
    </div>
  );
}

/** Mesmo padrão de notas-pedido / ficha: shell leve + chunk da rota sob demanda. */
export function lazyAppRoute(loader: () => Promise<RouteModule>) {
  const Lazy = dynamic(loader, { loading: () => <RouteChunkLoadingShell /> });
  return function AppRoutePage() {
    return (
      <Suspense fallback={<RouteChunkLoadingShell />}>
        <Lazy />
      </Suspense>
    );
  };
}
