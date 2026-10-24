"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { useCooperadoTabPanelActive } from "@/hooks/useCooperadoTabPanelActive";
import { useCooperadoFluxoPadrao } from "@/hooks/useCooperadoFluxoPadrao";
import { useCooperadoInicioValorReceberCardState } from "@/hooks/useCooperadoInicioValorReceberCardState";
import { CooperadoInicioSafeRoot } from "@/components/cooperado/CooperadoInicioSafeRoot";
import {
  CooperadoInicioCooperadoLiveRoot,
  CooperadoInicioOláTitulo,
} from "@/components/cooperado/CooperadoInicioCooperadoLiveLeaf";
import { CooperadoInicioValorReceberCard } from "@/components/cooperado/CooperadoInicioValorReceberCard";
import { Button } from "@/components/ui/Button";
import { setCooperadoOptimisticTab } from "@/lib/performance/cooperadoOptimisticTabNavigation";
import { cooperadoTabWarmOnPointerDown } from "@/lib/performance/cooperadoTabPointerWarmup";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaNome } from "@/utils/cooperativa";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";

function EnviarFotoEntregaInicioCard({ onEnviar }: { onEnviar: () => void }) {
  return (
    <div className="bg-white border-2 border-green-200 rounded-2xl p-6 flex flex-col justify-between">
      <div>
        <Camera size={28} className="text-green-700 mb-3" />
        <p className="font-semibold text-gray-900">Registrar entrega na escola</p>
        <p className="text-sm text-gray-500 mt-1">
          Tire foto do pedido assinado e envie para a cooperativa.
        </p>
      </div>
      <Button type="button" className="mt-4 w-full" size="lg" onClick={onEnviar}>
        Enviar foto da entrega
      </Button>
    </div>
  );
}

/**
 * Início mínimo — piloto Jeferson fase A1. Sem snapshot PWA pesado nem CooperadoDashboardInicioView.
 */
export function CooperadoInicioJefersonPilotoView() {
  const tabActive = useCooperadoTabPanelActive("/dashboard");
  const { user } = useAuth();
  const { syncingForUi } = useSyncStatus();
  const fluxo = useCooperadoFluxoPadrao();
  const { snapshot: valorReceberCard, atualizando: cardFinanceiroAtualizando } =
    useCooperadoInicioValorReceberCardState({
      data: fluxo.data,
      cooperadoId: fluxo.cooperadoId,
      cooperativaId: fluxo.cooperativaId,
      dataReady: fluxo.dataReady,
      syncing: syncingForUi,
      apresentacaoConsolidada: fluxo.apresentacaoConsolidada,
      carregandoValoresFinanceiros: fluxo.carregandoValoresFinanceiros,
      leituraSomentePwa: false,
      tabAtiva: tabActive,
    });
  const router = useRouter();
  const irEnviarFotoEntrega = useCallback(() => {
    setCooperadoOptimisticTab("/notas-pedido");
    cooperadoTabWarmOnPointerDown("/notas-pedido");
    router.push("/notas-pedido?anexar=1");
  }, [router]);

  const mesAtual = getCurrentMesReferencia();
  const coopNome =
    user && isAppDataWarm() ? getUserCooperativaNome(user, getData()) : "";

  return (
    <CooperadoInicioSafeRoot>
      <CooperadoInicioCooperadoLiveRoot
        cooperadoIdCard={fluxo.cooperadoId}
        cooperativaIdCard={fluxo.cooperativaId}
      >
        <div className="space-y-6 max-w-3xl" data-cooperado-inicio-piloto-jeferson="1">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              <CooperadoInicioOláTitulo />
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {coopNome ? `${coopNome} · ` : ""}
              {formatMesReferencia(mesAtual)}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CooperadoInicioValorReceberCard
              snapshot={valorReceberCard}
              atualizando={cardFinanceiroAtualizando}
              exibirReciboAssinatura
            />
            <EnviarFotoEntregaInicioCard onEnviar={irEnviarFotoEntrega} />
          </div>
        </div>
      </CooperadoInicioCooperadoLiveRoot>
    </CooperadoInicioSafeRoot>
  );
}
