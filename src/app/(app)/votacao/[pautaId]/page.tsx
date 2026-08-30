"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getPautaVotacaoCooperado, registrarVotoCooperado } from "@/services/votacaoService";
import { VotacaoDeliberativaForm } from "@/components/votacao/VotacaoDeliberativaForm";
import { updateData } from "@/services/dataStore";
import { pushCooperadoOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { getCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { requestAppSync } from "@/services/syncRequest";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { VotacaoOpcao } from "@/types";

export default function VotacaoDeliberativaPage() {
  const params = useParams();
  const pautaId = String(params.pautaId ?? "");
  const router = useRouter();
  const { user } = useAuth();
  const { isCooperado } = usePermissions();
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    if (user && !isCooperado) router.replace("/votacoes");
  }, [user, isCooperado, router]);

  const view = useAppDataSelector(
    (data) => {
      if (!data || !user?.cooperadoId || !pautaId) return undefined;
      const coopId = getUserCooperativaId(user, data);
      if (!coopId) return null;
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      const ctx = getPautaVotacaoCooperado(data, pautaId, coopId, cooperadoId);
      return ctx ? { ...ctx, coopId, cooperadoId } : null;
    },
    [user?.id, user?.cooperadoId, user?.cooperativaId, pautaId]
  );

  if (!isCooperado) return null;
  if (view === undefined) return <PageSkeleton />;

  if (!view) {
    return (
      <div className="max-w-3xl space-y-4">
        <AlertBanner variant="info" title="Votação indisponível">
          <p>Esta pauta não está aberta, o prazo encerrou ou você não tem acesso.</p>
        </AlertBanner>
      </div>
    );
  }

  if (view.jaVotou) {
    return (
      <div className="max-w-3xl space-y-4">
        <AlertBanner variant="success" title="Voto já registrado">
          <p>Você já participou desta votação. Obrigado!</p>
        </AlertBanner>
      </div>
    );
  }

  const handleRegistrar = async (
    voto: VotacaoOpcao,
    assinaturaDataUrl: string
  ): Promise<{ ok: boolean; error?: string }> => {
    setProcessando(true);
    let result: { ok: boolean; error?: string } = { ok: false };
    try {
      updateData((d) => {
        const reg = registrarVotoCooperado(d, {
          pautaId,
          cooperativaId: view.coopId,
          cooperadoId: view.cooperadoId,
          voto,
          assinaturaDataUrl,
        });
        if (!reg.ok) {
          result = { ok: false, error: reg.error };
          return d;
        }
        result = { ok: true };
        const cnpj = getCooperativaCnpj(reg.data, view.coopId);
        if (cnpj) void pushCooperadoOperacionalToCloud(cnpj, view.coopId);
        else requestAppSync();
        return reg.data;
      });
    } finally {
      setProcessando(false);
    }
    return result;
  };

  return (
    <VotacaoDeliberativaForm pauta={view.pauta} onRegistrar={handleRegistrar} processando={processando} />
  );
}
