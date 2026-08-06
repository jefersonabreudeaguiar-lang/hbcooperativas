"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resultadoCooperadoVisivelPorPauta } from "@/services/votacaoService";
import { VotacaoResultadoDetalheCooperado } from "@/components/votacao/VotacaoResultadoDetalheCooperado";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";

export default function VotacaoResultadoCooperadoPage() {
  const params = useParams();
  const pautaId = String(params.pautaId ?? "");
  const router = useRouter();
  const { user } = useAuth();
  const { isCooperado } = usePermissions();

  const view = useAppDataSelector(
    (data) => {
      if (!data || !user || !pautaId) return null;
      const coopId = getUserCooperativaId(user, data);
      if (!coopId) return null;
      return resultadoCooperadoVisivelPorPauta(data, pautaId, coopId);
    },
    [user?.id, user?.cooperativaId, pautaId]
  );

  useEffect(() => {
    if (!user) return;
    if (!isCooperado) {
      router.replace("/votacoes");
    }
  }, [user, isCooperado, router]);

  if (!isCooperado) return null;

  if (view === undefined) return <PageSkeleton />;

  if (!view) {
    return (
      <div className="max-w-3xl space-y-4">
        <AlertBanner variant="info" title="Resultado indisponível">
          <p>
            O detalhe desta votação não está mais disponível. O prazo de 24 horas após a publicação
            do resultado já passou, ou a pauta não foi encontrada.
          </p>
        </AlertBanner>
      </div>
    );
  }

  return <VotacaoResultadoDetalheCooperado resumo={view.resumo} />;
}
