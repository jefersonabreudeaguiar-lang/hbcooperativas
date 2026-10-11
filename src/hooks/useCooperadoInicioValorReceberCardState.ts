"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "@/types";
import {
  cooperadoBicAutorizaZerarCardInicio,
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
import { isCooperadoUserSyncVisible } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT } from "@/lib/cooperado/cooperadoPwaLeveUi";
import {
  cooperadoTemReciboAssinadoLocalSemPendenciaUi,
  resolverCooperativaIdReciboLatch,
} from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";
import { lerInicioCardPersistidoResume } from "@/lib/cooperado/cooperadoPwaInstantResume";
import { inicioCardMotorFromParidadeFinanceiro } from "@/lib/cooperado/cooperadoFinanceiroParidadeInicioBridge";
import {
  lerCooperadoPwaFichaResumoSnapshot,
  resolveParidadeFromFichaResumoSnapshot,
} from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { getData, isAppDataWarm } from "@/services/dataStore";

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
  /** PWA mobile: só persistido + Atualizar explícito — sem motor ao vivo a cada sync. */
  leituraSomentePwa?: boolean;
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

  const [persistidoTick, setPersistidoTick] = useState(0);

  const [bootPersistido] = useState(() => {
    if (!input.cooperadoId) return null;
    return filtrarInicioCardPersistidoLeituraBic(
      lerInicioCardPersistidoFlex(input.cooperadoId, input.cooperativaId)
    );
  });

  const leituraSomentePwa = Boolean(input.leituraSomentePwa && isCooperadoPwaMobileLeveUi());

  useEffect(() => {
    if (!leituraSomentePwa) return;
    const onRefresh = () => setPersistidoTick((n) => n + 1);
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
  }, [leituraSomentePwa]);

  const persistido = useMemo(() => {
    if (!input.cooperadoId) return bootPersistido;
    if (leituraSomentePwa) {
      return (
        lerInicioCardPersistidoResume(input.cooperadoId, input.cooperativaId) ?? bootPersistido
      );
    }
    return (
      filtrarInicioCardPersistidoLeituraBic(
        lerInicioCardPersistidoFlex(input.cooperadoId, input.cooperativaId)
      ) ?? bootPersistido
    );
  }, [
    input.cooperadoId,
    input.cooperativaId,
    bootPersistido,
    persistidoTick,
    leituraSomentePwa,
  ]);

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
    if (leituraSomentePwa) {
      const persistidoMesmoBuildEarly =
        persistido?.appBuild === APP_BUILD_VERSION ? persistido : null;
      const syncMotorPass = Boolean(input.syncing && isCooperadoUserSyncVisible());
      const needsMotor =
        syncMotorPass ||
        persistidoTick > 0 ||
        !persistidoMesmoBuildEarly?.display;

      const data =
        needsMotor || !persistidoMesmoBuildEarly?.display
          ? (isAppDataWarm() ? getData() : null) ?? input.data
          : null;
      const cooperativaIdCard =
        data && input.cooperadoId
          ? resolverCooperativaIdReciboLatch(data, input.cooperadoId, input.cooperativaId)
          : input.cooperativaId;
      const dataLatch =
        data ?? ((isAppDataWarm() ? getData() : null) ?? input.data);
      const cooperativaIdLatch =
        dataLatch && input.cooperadoId
          ? resolverCooperativaIdReciboLatch(dataLatch, input.cooperadoId, input.cooperativaId)
          : cooperativaIdCard;
      const reciboAssinadoLocal =
        dataLatch &&
        input.cooperadoId &&
        cooperadoTemReciboAssinadoLocalSemPendenciaUi(
          dataLatch,
          input.cooperadoId,
          cooperativaIdLatch
        );

      const fromMotor =
        needsMotor && data && input.cooperadoId && cooperativaIdCard
          ? resolverCardInicioEndurecido({
              data,
              cooperadoId: input.cooperadoId,
              cooperativaId: cooperativaIdCard,
              apresentacaoConsolidada: true,
              carregandoFinanceiro: false,
              prevLatch: null,
              persistido: null,
            })
          : null;

      if (
        fromMotor &&
        cooperadoMotorTemObrigacaoReceber(fromMotor.display)
      ) {
        return { ...fromMotor, gravarPersistencia: false };
      }

      const persistidoMesmoBuild = persistidoMesmoBuildEarly;

      const persistidoComObrigacao = Boolean(
        persistidoMesmoBuild?.display &&
          cooperadoMotorTemObrigacaoReceber(persistidoMesmoBuild.display)
      );
      const motorZeradoComProva =
        fromMotor &&
        !cooperadoMotorTemObrigacaoReceber(fromMotor.display) &&
        data &&
        input.cooperadoId &&
        cooperativaIdCard &&
        (reciboAssinadoLocal ||
          cooperadoBicAutorizaZerarCardInicio(data, input.cooperadoId, cooperativaIdCard, {
            tinhaValorExibido: persistidoComObrigacao,
          }));

      if (motorZeradoComProva && fromMotor) {
        return { ...fromMotor, gravarPersistencia: false };
      }

      if (
        persistidoMesmoBuild?.display &&
        cooperadoMotorTemObrigacaoReceber(persistidoMesmoBuild.display)
      ) {
        const display = persistidoMesmoBuild.display;
        return {
          display,
          latch: {
            motorRevision: persistidoMesmoBuild.motorRevision,
            display,
            hadPendencia: true,
          },
          atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
          gravarPersistencia: false,
        };
      }

      if (fromMotor) {
        return { ...fromMotor, gravarPersistencia: false };
      }

      if (persistidoMesmoBuild?.display) {
        const display = persistidoMesmoBuild.display;
        if (
          reciboAssinadoLocal &&
          !cooperadoMotorTemObrigacaoReceber(display)
        ) {
          return {
            display: SNAPSHOT_VAZIO,
            latch: {
              motorRevision: persistidoMesmoBuild.motorRevision,
              display: SNAPSHOT_VAZIO,
              hadPendencia: false,
            },
            atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
            gravarPersistencia: false,
          };
        }
        return {
          display,
          latch: {
            motorRevision: persistidoMesmoBuild.motorRevision,
            display,
            hadPendencia: cooperadoMotorTemObrigacaoReceber(display),
          },
          atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
          gravarPersistencia: false,
        };
      }

      if (reciboAssinadoLocal) {
        return {
          display: SNAPSHOT_VAZIO,
          latch: {
            motorRevision: fromMotor?.latch.motorRevision ?? "",
            display: SNAPSHOT_VAZIO,
            hadPendencia: false,
          },
          atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
          gravarPersistencia: false,
        };
      }

      const fichaSnap =
        input.cooperadoId && cooperativaIdLatch
          ? lerCooperadoPwaFichaResumoSnapshot(input.cooperadoId, cooperativaIdLatch)
          : null;
      const paridadeSnap = fichaSnap ? resolveParidadeFromFichaResumoSnapshot(fichaSnap) : null;
      const dataParidade =
        dataLatch ?? (paridadeSnap && isAppDataWarm() ? getData() : null);
      if (paridadeSnap && dataParidade && input.cooperadoId) {
        const display = inicioCardMotorFromParidadeFinanceiro(
          dataParidade,
          input.cooperadoId,
          cooperativaIdLatch,
          paridadeSnap
        );
        return {
          display,
          latch: {
            motorRevision: `fichaSnap:${fichaSnap.savedAt}`,
            display,
            hadPendencia: cooperadoMotorTemObrigacaoReceber(display),
          },
          atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
          gravarPersistencia: false,
        };
      }

      return {
        display: SNAPSHOT_VAZIO,
        latch: { motorRevision: "", display: SNAPSHOT_VAZIO, hadPendencia: false },
        atualizando: !input.dataReady,
        gravarPersistencia: false,
      };
    }
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
    persistidoTick,
    leituraSomentePwa,
    ...(leituraSomentePwa ? [] : [hbDescontosRevision]),
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
