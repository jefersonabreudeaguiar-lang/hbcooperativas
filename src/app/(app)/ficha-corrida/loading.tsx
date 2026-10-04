import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Feedback imediato ao tocar Financeiro enquanto o chunk da rota carrega. */
export default function FichaCorridaLoading() {
  return <PageSkeleton compact />;
}
