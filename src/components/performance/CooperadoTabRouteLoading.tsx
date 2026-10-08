import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Skeleton imediato ao trocar aba cooperado (RQL 8.6 — usado em `loading.tsx` das 5 rotas). */
export function CooperadoTabRouteLoading() {
  return <PageSkeleton compact />;
}
CooperadoTabRouteLoading.displayName = "CooperadoTabRouteLoading";
