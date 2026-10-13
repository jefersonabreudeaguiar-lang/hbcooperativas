"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Cooperado } from "@/types";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { AssinaturaStatusAviso } from "@/components/cooperado/AssinaturaStatusAviso";
import { OnboardingChecklist } from "@/components/cooperado/OnboardingChecklist";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import {
  cooperadoPrecisaCadastrarAssinatura,
  normalizarAssinaturaLegadoCooperado,
} from "@/services/cooperadoAssinaturaService";

const CooperadoInicioLiveContext = createContext<Cooperado | undefined>(undefined);

/** Folha L1 — único subscribe de cooperado live para o Início. */
export function CooperadoInicioCooperadoLiveRoot({
  cooperadoIdCard,
  cooperativaIdCard,
  children,
}: {
  cooperadoIdCard?: string;
  cooperativaIdCard?: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const cooperadoLive = useAppDataSelector(
    (data) => {
      if (!data || !cooperadoIdCard) return undefined;
      const coopId = cooperativaIdCard ?? (user ? getUserCooperativaId(user, data) : undefined);
      const id = resolverCooperadoIdCanonico(data, cooperadoIdCard, coopId);
      return data.cooperados.find((c) => c.id === id) ?? undefined;
    },
    [cooperadoIdCard, cooperativaIdCard, user?.id, user?.cooperativaId]
  );
  return (
    <CooperadoInicioLiveContext.Provider value={cooperadoLive ?? undefined}>
      {children}
    </CooperadoInicioLiveContext.Provider>
  );
}

function useCooperadoInicioLiveCooperado(): Cooperado | undefined {
  return useContext(CooperadoInicioLiveContext);
}

export function CooperadoInicioOláTitulo({
  nomeFromView,
}: {
  nomeFromView?: string;
}) {
  const { user } = useAuth();
  const cooperadoLive = useCooperadoInicioLiveCooperado();
  const nome =
    nomeFromView ??
    cooperadoLive?.nomeCompleto.split(" ")[0] ??
    user?.name?.split(" ")[0] ??
    "Cooperado";
  return <>Olá, {nome}!</>;
}

export function CooperadoInicioAssinaturaOnboardingLive({
  cooperado,
  cooperadoId,
  mostrarAssinaturaPilot,
  precisaPix,
}: {
  cooperado: Cooperado | undefined;
  cooperadoId: string;
  mostrarAssinaturaPilot: boolean;
  precisaPix: boolean;
}) {
  const cooperadoLive = useCooperadoInicioLiveCooperado();
  const cooperadoExibicao = cooperado ?? cooperadoLive;
  const precisaAssinatura = Boolean(
    cooperadoExibicao &&
      cooperadoUsaAssinaturaCadastroPilot(cooperadoId) &&
      cooperadoPrecisaCadastrarAssinatura(
        cooperadoId,
        normalizarAssinaturaLegadoCooperado(cooperadoExibicao)
      )
  );

  return (
    <>
      {cooperadoExibicao ? <AssinaturaStatusAviso cooperado={cooperadoExibicao} /> : null}
      <OnboardingChecklist
        pixOk={!precisaPix}
        mostrarAssinatura={mostrarAssinaturaPilot}
        assinaturaOk={!precisaAssinatura}
      />
    </>
  );
}
