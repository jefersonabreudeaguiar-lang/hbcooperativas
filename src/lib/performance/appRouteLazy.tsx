import { Suspense, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

type RouteModule = { default: ComponentType };

/** Mesmo padrão de notas-pedido / ficha: shell leve + chunk da rota sob demanda. */
export function lazyAppRoute(loader: () => Promise<RouteModule>) {
  const Lazy = dynamic(loader, { loading: () => <PageSkeleton compact /> });
  return function AppRoutePage() {
    return (
      <Suspense fallback={<PageSkeleton compact />}>
        <Lazy />
      </Suspense>
    );
  };
}
