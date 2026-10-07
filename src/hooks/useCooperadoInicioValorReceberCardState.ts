"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "@/types";
import {
  cooperadoMotorTemObrigacaoReceber,
  filtrarInicioCardPersistidoLeituraBic,
  resolverCardInicioEndurecido,
  sanitizeInicioCardSnapshotParaPersistenciaBic,
  type InicioCardLatchState,
  type InicioCardMotorSnapshot,
} from "@/lib/cooperadoInicioCardPolicy";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";
import {
  INICIO_CARD_STORAGE_VERSION,
  gravarInicioCardPersistidoFlex,
  lerInicioCardPersistidoFlex,
} from "@/lib/cooperadoInicioCardPersistencia";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const SNAPSHOT_VAZIO: InicioCardMotorSnapshot = {
  mesLabel: "—",
  valor: 0,
  valorRecibo: 0,
  aguardandoAssinatura: false,
};

export function useCooperadoInicioValorReceberCardState(input: {
  data: AppData | null;
  cooperadoId: string | undefined;
  cooperativaId: string | undefined;
  dataReady: boolean;
  syncing: boolean;
  apresentacaoConsolidada?: boolean;
  carregandoValoresFinanceiros?: boolean;
}): {
  snapshot: InicioCardMotorSnapshot;
  atualizando: boolean;
} {
  const latchRef = useRef<InicioCardLatchState | null>(null);
  const tenantKeyRef = useRef("");

  const tenantKey = `${input.cooperadoId ?? ""}:${input.cooperativaId ?? ""}`;
  if (tenantKeyRef.current !== tenantKey) {
    tenantKeyRef.current = tenantKey;
    latchRef.current = null;
  }

  const [bootPersistido] = useState(() => {
    if (!input.cooperadoId) return null;
    return filtrarInicioCardPersistidoLeituraBic(
      lerInicioCardPersistidoFlex(input.cooperadoId, input.cooperativaId)
    );
  });

  const persistido = useMemo(() => {
    if (!input.cooperadoId) return bootPersistido;
    return (
      filtrarInicioCardPersistidoLeituraBic(
        lerInicioCardPersistidoFlex(input.cooperadoId, input.cooperativaId)
      ) ?? bootPersistido
    );
  }, [input.cooperadoId, input.cooperativaId, bootPersistido]);

  const hbDescontosRevision = useContaCoopDescontosRevision();

  const apresentacaoConsolidada = input.apresentacaoConsolidada ?? false;
  const carregandoFinanceiro =
    Boolean(input.syncing) ||
    (!input.dataReady && !cooperadoMotorTemObrigacaoReceber(persistido?.display ?? SNAPSHOT_VAZIO));

  useEffect(() => {
    if (apresentacaoConsolidada && !input.syncing) {
      latchRef.current = null;
    }
  }, [apresentacaoConsolidada, input.syncing, hbDescontosRevision]);

  const resolved = useMemo(() => {
    const omitirPersistido =
      apresentacaoConsolidada && !input.syncing && !carregandoFinanceiro;
    return resolverCardInicioEndurecido({
      data: input.data,
      cooperadoId: input.cooperadoId,
      cooperativaId: input.cooperativaId,
      apresentacaoConsolidada,
      carregandoFinanceiro,
      prevLatch: omitirPersistido ? null : latchRef.current,
      persistido: omitirPersistido ? null : persistido,
      dataReady: input.dataReady,
      syncing: input.syncing,
    });
  }, [
    input.data,
    input.cooperadoId,
    input.cooperativaId,
    input.dataReady,
    input.syncing,
    input.apresentacaoConsolidada,
    carregandoFinanceiro,
    persistido,
    hbDescontosRevision,
  ]);

  latchRef.current = resolved.latch;

  useEffect(() => {
    if (!input.cooperadoId || !input.cooperativaId || !resolved.gravarPersistencia) return;
    gravarInicioCardPersistidoFlex(input.cooperadoId, input.cooperativaId, {
      v: INICIO_CARD_STORAGE_VERSION,
      appBuild: APP_BUILD_VERSION,
      motorRevision: resolved.latch.motorRevision,
      display: sanitizeInicioCardSnapshotParaPersistenciaBic(resolved.display),
      savedAt: new Date().toISOString(),
    });
  }, [
    input.cooperadoId,
    input.cooperativaId,
    resolved.display,
    resolved.latch.motorRevision,
    resolved.gravarPersistencia,
  ]);

  const atualizando =
    resolved.atualizando ||
    (Boolean(input.carregandoValoresFinanceiros) &&
      cooperadoMotorTemObrigacaoReceber(resolved.display)) ||
    (input.syncing && !cooperadoMotorTemObrigacaoReceber(resolved.display));

  return {
    snapshot: resolved.display,
    atualizando,
  };
}
