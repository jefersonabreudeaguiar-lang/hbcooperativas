"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  lerInicioCardPersistidoFlexSemFiltroBuild,
  type InicioCardPersistido,
} from "@/lib/cooperadoInicioCardPersistencia";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { isCooperadoUserSyncVisible } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isCooperadoMobilePilotPerfActive } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import {
  COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT,
  dispatchCooperadoPwaLeveUiSnapshotRefresh,
} from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import {
  cooperadoTemReciboAssinadoLocalSemPendenciaUi,
  resolverCooperativaIdReciboLatch,
} from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";
import { lerInicioCardPersistidoResume } from "@/lib/cooperado/cooperadoPwaInstantResume";
import { inicioCardMotorFromParidadeFinanceiro } from "@/lib/cooperado/cooperadoFinanceiroParidadeInicioBridge";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import { cooperadoPwaFichaParidadeSnapshotDivergeDeAppData } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import {
  cooperadoGaValorReceberExibicaoIndeterminada,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import {
  lerCooperadoPwaFichaResumoSnapshot,
  resolveParidadeFromFichaResumoSnapshot,
} from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { getData, isAppDataWarm, preloadAppData, subscribe } from "@/services/dataStore";
import { cooperadoPilotCardInicioLeituraRapida } from "@/lib/cooperado/cooperadoMobilePilotInicioValorLocal";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoPwaFinanceiroSnapshotsAusentes } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";

const SNAPSHOT_VAZIO: InicioCardMotorSnapshot = {
  mesLabel: "—",
  valor: 0,
  valorRecibo: 0,
  aguardandoAssinatura: false,
};

function persistidoExibicaoPwaLeve(
  persistido: InicioCardPersistido | null | undefined
): InicioCardPersistido | null {
  if (!persistido?.display) return null;
  if (persistido.appBuild === APP_BUILD_VERSION) return persistido;
  if (
    isCooperadoMobilePilotPerfActive() &&
    cooperadoMotorTemObrigacaoReceber(persistido.display)
  ) {
    return persistido;
  }
  return null;
}

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
  const { user: sessionUser } = useAuth();
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

  const leituraSomentePwa = Boolean(
    input.leituraSomentePwa &&
      (isCooperadoPwaMobileLeveUi() || isCooperadoMobilePilotPerfActive())
  );

  const appDataWarmKey = useSyncExternalStore(
    subscribe,
    () => (isAppDataWarm() ? "1" : "0"),
    () => "0"
  );

  useEffect(() => {
    if (!leituraSomentePwa || !isCooperadoMobilePilotPerfActive()) return;
    if (isAppDataWarm()) return;
    preloadAppData();
  }, [leituraSomentePwa, appDataWarmKey]);

  useEffect(() => {
    if (!leituraSomentePwa) return;
    const onRefresh = () => setPersistidoTick((n) => n + 1);
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
  }, [leituraSomentePwa]);

  const persistido = useMemo(() => {
    if (!input.cooperadoId) return bootPersistido;
    if (leituraSomentePwa) {
      const fromResume = lerInicioCardPersistidoResume(input.cooperadoId, input.cooperativaId);
      if (fromResume) return fromResume;
      if (isCooperadoMobilePilotPerfActive()) {
        const crossBuild = filtrarInicioCardPersistidoLeituraBic(
          lerInicioCardPersistidoFlexSemFiltroBuild(input.cooperadoId, input.cooperativaId)
        );
        if (crossBuild) return crossBuild;
      }
      return bootPersistido;
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
  const apresentacaoCard =
    isCooperadoMobilePilotPerfActive() ? true : apresentacaoConsolidada;
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
      if (isCooperadoMobilePilotPerfActive() && input.cooperadoId) {
        const pilotDisplay = cooperadoPilotCardInicioLeituraRapida(
          input.cooperadoId,
          input.cooperativaId,
          sessionUser
        );
        if (pilotDisplay && cooperadoMotorTemObrigacaoReceber(pilotDisplay)) {
          return {
            display: pilotDisplay,
            latch: {
              motorRevision: `pilotLocal:${appDataWarmKey}`,
              display: pilotDisplay,
              hadPendencia: true,
            },
            atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
            gravarPersistencia: isAppDataWarm(),
          };
        }
      }

      const persistidoMesmoBuildEarly = persistidoExibicaoPwaLeve(persistido);
      const syncMotorPass = Boolean(input.syncing && isCooperadoUserSyncVisible());
      const pilotPrecisaMotorLocal = (() => {
        if (!isCooperadoMobilePilotPerfActive()) return false;
        if (
          persistidoMesmoBuildEarly?.display &&
          cooperadoMotorTemObrigacaoReceber(persistidoMesmoBuildEarly.display)
        ) {
          return false;
        }
        if (!input.cooperadoId || !isAppDataWarm()) return false;
        const data = getData();
        const coopId =
          input.cooperativaId ??
          (data.cooperativas?.length === 1 ? data.cooperativas[0]?.id : undefined);
        if (!coopId) return cooperadoPwaFinanceiroSnapshotsAusentes(input.cooperadoId, coopId);
        const canon = resolverCooperadoIdCanonico(data, input.cooperadoId, coopId);
        if (cooperadoPwaFinanceiroSnapshotsAusentes(canon, coopId)) return true;
        return cooperadoTemDadosFinanceirosMinimos(data, canon, coopId);
      })();
      const gaParidadeWarm =
        isCooperadoMobilePilotPerfActive() && isAppDataWarm() && Boolean(input.cooperadoId);
      const needsMotor =
        syncMotorPass ||
        persistidoTick > 0 ||
        pilotPrecisaMotorLocal ||
        Boolean(gaParidadeWarm) ||
        !persistidoMesmoBuildEarly?.display ||
        (input.dataReady && apresentacaoCard);

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
              apresentacaoConsolidada: apresentacaoCard,
              carregandoFinanceiro: carregandoFinanceiro && !apresentacaoCard,
              prevLatch: null,
              persistido: null,
              dataReady: input.dataReady,
              syncing: input.syncing,
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

      if (fromMotor && cooperadoMotorTemObrigacaoReceber(fromMotor.display)) {
        return { ...fromMotor, gravarPersistencia: true };
      }

      if (dataLatch && input.cooperadoId && cooperativaIdLatch) {
        const paridadeMotor = resolverMotorCardInicioParidadeFinanceiro(
          dataLatch,
          input.cooperadoId,
          cooperativaIdLatch
        );
        if (cooperadoMotorTemObrigacaoReceber(paridadeMotor.motor)) {
          return {
            display: paridadeMotor.motor,
            latch: {
              motorRevision: paridadeMotor.revision,
              display: paridadeMotor.motor,
              hadPendencia: true,
            },
            atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
            gravarPersistencia: true,
          };
        }
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

      const fichaSnap =
        input.cooperadoId && cooperativaIdLatch
          ? lerCooperadoPwaFichaResumoSnapshot(input.cooperadoId, cooperativaIdLatch)
          : null;
      const paridadeSnap = fichaSnap ? resolveParidadeFromFichaResumoSnapshot(fichaSnap) : null;
      const dataParidade =
        dataLatch ?? (paridadeSnap && isAppDataWarm() ? getData() : null);
      if (paridadeSnap && dataParidade && input.cooperadoId && fichaSnap) {
        const snapDiverge =
          cooperativaIdLatch &&
          cooperadoPwaFichaParidadeSnapshotDivergeDeAppData(
            dataParidade,
            input.cooperadoId,
            cooperativaIdLatch
          );
        if (!snapDiverge) {
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
            gravarPersistencia: true,
          };
        }
      }

      if (dataLatch && input.cooperadoId && cooperativaIdLatch) {
        const motorLocal = resolverCardInicioEndurecido({
          data: dataLatch,
          cooperadoId: input.cooperadoId,
          cooperativaId: cooperativaIdLatch,
          apresentacaoConsolidada: apresentacaoCard,
          carregandoFinanceiro: carregandoFinanceiro && !apresentacaoCard,
          prevLatch: null,
          persistido: null,
          dataReady: input.dataReady,
          syncing: input.syncing,
        });
        if (cooperadoMotorTemObrigacaoReceber(motorLocal.display)) {
          return { ...motorLocal, gravarPersistencia: true };
        }
      }

      if (reciboAssinadoLocal) {
        return {
          display: SNAPSHOT_VAZIO,
          latch: {
            motorRevision: "",
            display: SNAPSHOT_VAZIO,
            hadPendencia: false,
          },
          atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
          gravarPersistencia: false,
        };
      }

      if (dataLatch && input.cooperadoId && cooperativaIdLatch) {
        const paridadeLive = cooperadoLeituraFinanceiraExibicao(
          dataLatch,
          input.cooperadoId,
          cooperativaIdLatch
        );
        if (paridadeLive.valorLiquido > 0.005) {
          const display = inicioCardMotorFromParidadeFinanceiro(
            dataLatch,
            input.cooperadoId,
            cooperativaIdLatch,
            paridadeLive
          );
          return {
            display,
            latch: {
              motorRevision: `paridadeLive:${paridadeLive.valorLiquido}`,
              display,
              hadPendencia: true,
            },
            atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
            gravarPersistencia: true,
          };
        }
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
      apresentacaoConsolidada: apresentacaoCard,
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
    appDataWarmKey,
    sessionUser?.id,
    sessionUser?.cooperativaId,
    apresentacaoCard,
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
    if (leituraSomentePwa) {
      dispatchCooperadoPwaLeveUiSnapshotRefresh();
    }
  }, [
    input.cooperadoId,
    input.cooperativaId,
    resolved.display,
    resolved.latch.motorRevision,
    resolved.gravarPersistencia,
    leituraSomentePwa,
  ]);

  const exibicaoIndeterminada =
    sessionUser?.role === "cooperado" &&
    cooperadoGaValorReceberExibicaoIndeterminada(sessionUser, resolved.display);

  const atualizando =
    exibicaoIndeterminada ||
    resolved.atualizando ||
    (Boolean(input.carregandoValoresFinanceiros) &&
      cooperadoMotorTemObrigacaoReceber(resolved.display)) ||
    (input.syncing && !cooperadoMotorTemObrigacaoReceber(resolved.display));

  return {
    snapshot: resolved.display,
    atualizando,
  };
}
