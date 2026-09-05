"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getEscopoEleitoralPauta, getPautaById, getPautaVotacaoCooperado, registrarVotoCooperado, confirmarVotoCooperadoNuvem, removerVotoCooperadoPauta } from "@/services/votacaoService";
import { VotacaoDeliberativaForm } from "@/components/votacao/VotacaoDeliberativaForm";
import { updateData } from "@/services/dataStore";
import { pushVotoCooperadoToCloud } from "@/services/votacaoCloudService";
import { getCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { requestAppSync } from "@/services/syncRequest";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { VotacaoOpcao, VotacaoVoto } from "@/types";

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
      const cooperado = data.cooperados.find((c) => c.id === cooperadoId && c.cooperativaId === coopId);
      const pauta = getPautaById(data, pautaId, coopId);
      const ctx = getPautaVotacaoCooperado(data, pautaId, coopId, cooperadoId);
      if (ctx) return { ...ctx, coopId, cooperadoId, cooperado, motivoIndisponivel: null as string | null };
      if (!pauta) return { pauta: null, jaVotou: false, coopId, cooperadoId, cooperado, motivoIndisponivel: "inexistente" };
      if (pauta.status !== "aberta") {
        return { pauta: null, jaVotou: false, coopId, cooperadoId, cooperado, motivoIndisponivel: "fechada" };
      }
      if (getEscopoEleitoralPauta(pauta) === "diretoria") {
        return { pauta: null, jaVotou: false, coopId, cooperadoId, cooperado, motivoIndisponivel: "diretoria" };
      }
      return { pauta: null, jaVotou: false, coopId, cooperadoId, cooperado, motivoIndisponivel: "fechada" };
    },
    [user?.id, user?.cooperadoId, user?.cooperativaId, pautaId]
  );

  if (!isCooperado) return null;
  if (view === undefined) return <PageSkeleton />;

  if (!view?.pauta) {
    const mensagem =
      view?.motivoIndisponivel === "diretoria"
        ? "Esta votação é restrita aos membros da diretoria. Se você faz parte da diretoria, peça ao responsável para marcar seu cadastro em Cooperados."
        : "Esta pauta não está aberta, o prazo encerrou ou você não tem acesso.";

    return (
      <div className="max-w-3xl space-y-4">
        <AlertBanner variant="info" title="Votação indisponível">
          <p>{mensagem}</p>
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
    let votoEnviado: VotacaoVoto | null = null;
    let cnpjEnvio: string | undefined;
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
        votoEnviado =
          (reg.data.votacaoVotos ?? []).find(
            (item) => item.pautaId === pautaId && item.cooperadoId === view.cooperadoId
          ) ?? null;
        cnpjEnvio = getCooperativaCnpj(reg.data, view.coopId);
        result = { ok: true };
        return reg.data;
      });

      if (result.ok && votoEnviado && cnpjEnvio) {
        const cloud = await pushVotoCooperadoToCloud(cnpjEnvio, votoEnviado);
        if (!cloud.ok) {
          updateData((d) =>
            removerVotoCooperadoPauta(d, pautaId, view.cooperadoId, view.coopId)
          );
          result = { ok: false, error: cloud.error };
        } else {
          updateData((d) =>
            confirmarVotoCooperadoNuvem(d, pautaId, view.cooperadoId, view.coopId)
          );
          requestAppSync();
        }
      } else if (result.ok && !cnpjEnvio) {
        requestAppSync();
      }
    } finally {
      setProcessando(false);
    }
    return result;
  };

  return (
    <VotacaoDeliberativaForm
      pauta={view.pauta}
      cooperadoId={view.cooperadoId}
      cooperado={view.cooperado}
      onRegistrar={handleRegistrar}
      processando={processando}
    />
  );
}
