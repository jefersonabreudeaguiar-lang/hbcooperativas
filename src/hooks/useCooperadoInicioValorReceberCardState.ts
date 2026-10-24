"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AppData } from "@/types";
import {
  cooperadoBicAutorizaZerarCardInicio,
  cooperadoMotorTemObrigacaoReceber,
  resolverCardInicioEndurecido,
  sanitizeInicioCardSnapshotParaPersistenciaBic,
  cooperadoInicioCardAlinharValorFicha,
  cooperadoInicioCardEscolherDisplayEstavel,
  type InicioCardLatchState,
  type InicioCardMotorSnapshot,
} from "@/lib/cooperadoInicioCardPolicy";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";
import {
  INICIO_CARD_STORAGE_VERSION,
  gravarInicioCardPersistidoFlex,
  type InicioCardPersistido,
} from "@/lib/cooperadoInicioCardPersistencia";
import { lerInicioCardFinanceiroExibicao } from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import { isCooperadoUserSyncVisible } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isCooperadoMobilePilotPerfActive } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { HB_A_RECEBER_HIBRIDO_EVENT } from "@/lib/hb-credit/hbAReceberHibrido";
import {
  cooperadoTemReciboAssinadoLocalSemPendenciaUi,
  resolverCooperativaIdReciboLatch,
} from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";
import { inicioCardMotorFromParidadeFinanceiro } from "@/lib/cooperado/cooperadoFinanceiroParidadeInicioBridge";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import { cooperadoPwaFichaParidadeSnapshotDivergeDeAppData } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import {
  cooperadoGaValorReceberExibicaoIndeterminada,
  cooperadoGaValorReceberExibicaoResolvida,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import {
  cooperadoApresentacaoFinanceiroUiCooperado,
  cooperadoCardInicioMotorParidadeFinanceiro,
  cooperadoInicioSincronizadoComFinanceiro,
} from "@/lib/cooperado/cooperadoInicioSincronizadoComFinanceiro";
import { cooperadoAReceberParidadeUnificadaPilotoJeferson } from "@/lib/cooperado/cooperadoAReceberParidadeMobileUnificada";
import { useCooperadoParidadeExibicaoJeferson } from "@/hooks/useCooperadoParidadeExibicaoJeferson";
import { rematerializarCooperadoPwaSnapshotsSeNecessario } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  lerCooperadoPwaFichaResumoSnapshot,
  resolveParidadeFromFichaResumoSnapshot,
} from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import {
  aplicarDebitoHbHibridoNoValor,
  escolherDebitoHbHibrido,
  linhasOverlayDebitoHbAReceber,
} from "@/lib/hb-credit/hbAReceberHibrido";
import {
  getAppDataDomainRevision,
  subscribeAppDataDomain,
  type AppDataNotifyDomain,
} from "@/lib/performance/appDataDomainNotify";
import {
  COOPERADO_BIC_HYBRID_FINANCE_DOMAINS,
  cooperadoBicHybridLightUiActive,
} from "@/lib/cooperado/cooperadoBicHybridLight";
import { getData, isAppDataWarm, preloadAppData, subscribe } from "@/services/dataStore";
import { cooperadoPilotCardInicioLeituraRapida } from "@/lib/cooperado/cooperadoMobilePilotInicioValorLocal";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  cooperadoFinanceiroExibicaoDivergeDeAppDataLive,
  cooperadoPwaFinanceiroSnapshotsAusentes,
} from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
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
  if (cooperadoPwaSnapshotBuildReadable(persistido.appBuild)) return persistido;
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
  /** Keep-alive: aba Início visível. Motor pesado só corre com a aba aberta. */
  tabAtiva?: boolean;
}): {
  snapshot: InicioCardMotorSnapshot;
  atualizando: boolean;
} {
  const { user: sessionUser } = useAuth();
  const { cooperadoPagamentosHydrated } = useSyncStatus();
  const latchRef = useRef<InicioCardLatchState | null>(null);
  const tenantKeyRef = useRef("");

  const tenantKey = `${input.cooperadoId ?? ""}:${input.cooperativaId ?? ""}`;
  if (tenantKeyRef.current !== tenantKey) {
    tenantKeyRef.current = tenantKey;
    latchRef.current = null;
  }

  const [persistidoTick, setPersistidoTick] = useState(0);

  const tabAtiva = input.tabAtiva !== false;
  const leituraSomentePwa = Boolean(
    input.leituraSomentePwa &&
      (isCooperadoPwaMobileLeveUi() || isCooperadoMobilePilotPerfActive())
  );

  const bicHybridFinanceDomains = cooperadoBicHybridLightUiActive(sessionUser);

  const appDataWarmKey = useSyncExternalStore(
    (onStoreChange) => {
      if (!bicHybridFinanceDomains) return subscribe(onStoreChange);
      const unsubs = COOPERADO_BIC_HYBRID_FINANCE_DOMAINS.map((d: AppDataNotifyDomain) =>
        subscribeAppDataDomain(d, onStoreChange)
      );
      return () => {
        for (const u of unsubs) u();
      };
    },
    () => {
      if (!isAppDataWarm()) return "0";
      if (!bicHybridFinanceDomains) return "1";
      return COOPERADO_BIC_HYBRID_FINANCE_DOMAINS.map((d) => getAppDataDomainRevision(d)).join(",");
    },
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
    window.addEventListener(HB_A_RECEBER_HIBRIDO_EVENT, onRefresh);
    return () => {
      window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
      window.removeEventListener(HB_A_RECEBER_HIBRIDO_EVENT, onRefresh);
    };
  }, [leituraSomentePwa]);

  const persistido = useMemo(() => {
    if (!input.cooperadoId) return null;
    return lerInicioCardFinanceiroExibicao(input.cooperadoId, input.cooperativaId);
  }, [input.cooperadoId, input.cooperativaId, persistidoTick]);

  const hbDescontosRevision = useContaCoopDescontosRevision();

  const apresentacaoConsolidada = input.apresentacaoConsolidada ?? false;
  const apresentacaoFinanceiroUi = cooperadoApresentacaoFinanceiroUiCooperado(
    sessionUser,
    apresentacaoConsolidada,
    cooperadoPagamentosHydrated
  );
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

  const pilotoParidadeUnificada = cooperadoAReceberParidadeUnificadaPilotoJeferson(sessionUser);
  const paridadeJeferson = useCooperadoParidadeExibicaoJeferson(
    sessionUser,
    pilotoParidadeUnificada && !leituraSomentePwa,
    apresentacaoConsolidada
  );

  useEffect(() => {
    if (!pilotoParidadeUnificada || !sessionUser || !isAppDataWarm()) return;
    if (rematerializarCooperadoPwaSnapshotsSeNecessario(sessionUser)) {
      setPersistidoTick((n) => n + 1);
    }
  }, [pilotoParidadeUnificada, sessionUser?.id, appDataWarmKey, paridadeJeferson?.valorLiquido, hbDescontosRevision]);

  const resolved = useMemo(() => {
    if (pilotoParidadeUnificada && !leituraSomentePwa) {
      if (paridadeJeferson && sessionUser?.cooperadoId) {
      const dataPar = input.data ?? (isAppDataWarm() ? getData() : null);
      if (dataPar) {
        const coopId = getUserCooperativaId(sessionUser, dataPar) ?? input.cooperativaId;
        const cooperadoId = resolverCooperadoIdCanonico(
          dataPar,
          sessionUser.cooperadoId,
          coopId
        );
        const motor = inicioCardMotorFromParidadeFinanceiro(
          dataPar,
          cooperadoId,
          coopId,
          paridadeJeferson
        );
        const valorFinanceiro = paridadeJeferson.valorLiquido > 0.005
          ? paridadeJeferson.valorLiquido
          : 0;
        const display =
          motor.aguardandoAssinatura && motor.valorRecibo > 0.005
            ? motor
            : {
                ...motor,
                mesLabel: paridadeJeferson.mesLabel?.trim() || motor.mesLabel,
                valor: valorFinanceiro,
              };
        const revision = `jeferson-paridade:${paridadeJeferson.valorLiquido}`;
        const temObrigacao = cooperadoMotorTemObrigacaoReceber(display);
        return {
          display,
          latch: {
            motorRevision: revision,
            display,
            hadPendencia: temObrigacao,
          },
          atualizando: !temObrigacao && Boolean(input.syncing && isCooperadoUserSyncVisible()),
          gravarPersistencia: temObrigacao,
        };
      }
      }
      const esperaParidade = persistido?.display &&
        cooperadoMotorTemObrigacaoReceber(persistido.display)
          ? persistido.display
          : SNAPSHOT_VAZIO;
      return {
        display: esperaParidade,
        latch: {
          motorRevision: "jeferson-paridade:aguardando",
          display: esperaParidade,
          hadPendencia: cooperadoMotorTemObrigacaoReceber(esperaParidade),
        },
        atualizando: true,
        gravarPersistencia: false,
      };
    }
    const syncInicioAtivo =
      cooperadoInicioSincronizadoComFinanceiro(sessionUser) &&
      !leituraSomentePwa &&
      input.cooperadoId &&
      (pilotoParidadeUnificada || tabAtiva);

    if (syncInicioAtivo && input.cooperadoId) {
      const cooperadoIdCard = input.cooperadoId;
      const dataPar = input.data ?? (isAppDataWarm() ? getData() : null);
      if (dataPar) {
        const cooperativaIdCard = resolverCooperativaIdReciboLatch(
          dataPar,
          cooperadoIdCard,
          input.cooperativaId
        );
        const paridadeMotor = cooperadoCardInicioMotorParidadeFinanceiro(
          dataPar,
          cooperadoIdCard,
          cooperativaIdCard,
          apresentacaoFinanceiroUi
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
        const autorizaZerar = cooperadoBicAutorizaZerarCardInicio(
          dataPar,
          cooperadoIdCard,
          cooperativaIdCard,
          { tinhaValorExibido: cooperadoMotorTemObrigacaoReceber(persistido?.display ?? SNAPSHOT_VAZIO) }
        );
        if (autorizaZerar) {
          return {
            display: paridadeMotor.motor,
            latch: {
              motorRevision: paridadeMotor.revision,
              display: paridadeMotor.motor,
              hadPendencia: false,
            },
            atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
            gravarPersistencia: true,
          };
        }
      }
    }
    if (leituraSomentePwa) {
      if (!tabAtiva) {
        const persistidoOcioso = persistidoExibicaoPwaLeve(persistido);
        if (
          persistidoOcioso?.display &&
          cooperadoMotorTemObrigacaoReceber(persistidoOcioso.display)
        ) {
          return {
            display: persistidoOcioso.display,
            latch: {
              motorRevision: persistidoOcioso.motorRevision,
              display: persistidoOcioso.display,
              hadPendencia: true,
            },
            atualizando: false,
            gravarPersistencia: false,
          };
        }
      }
      if (tabAtiva && isCooperadoMobilePilotPerfActive() && input.cooperadoId) {
        const pilotDisplay = cooperadoPilotCardInicioLeituraRapida(
          input.cooperadoId,
          input.cooperativaId,
          sessionUser
        );
        if (pilotDisplay && cooperadoMotorTemObrigacaoReceber(pilotDisplay)) {
          const persistidoValor = persistido?.display?.valor ?? 0;
          const mudou = Math.abs(pilotDisplay.valor - persistidoValor) > 0.005;
          return {
            display: pilotDisplay,
            latch: {
              motorRevision: `pilotLocal:${appDataWarmKey}`,
              display: pilotDisplay,
              hadPendencia: true,
            },
            atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
            gravarPersistencia: isAppDataWarm() && mudou,
          };
        }
      }

      const persistidoMesmoBuildEarly = persistidoExibicaoPwaLeve(persistido);
      const persistidoJaTemValor = Boolean(
        persistidoMesmoBuildEarly?.display &&
          cooperadoMotorTemObrigacaoReceber(persistidoMesmoBuildEarly.display)
      );
      const cacheDivergeMotorLive = (() => {
        if (!input.cooperadoId || !isAppDataWarm()) return false;
        const dataLive = getData();
        const coopLive =
          input.cooperativaId ??
          (dataLive.cooperativas?.length === 1 ? dataLive.cooperativas[0]?.id : undefined);
        if (!coopLive) return false;
        const canon = resolverCooperadoIdCanonico(dataLive, input.cooperadoId, coopLive);
        return cooperadoFinanceiroExibicaoDivergeDeAppDataLive(dataLive, canon, coopLive);
      })();
      const exibicaoGaResolvida =
        sessionUser?.role === "cooperado" &&
        cooperadoGaValorReceberExibicaoResolvida(sessionUser);
      const syncMotorPass =
        Boolean(input.syncing && isCooperadoUserSyncVisible()) &&
        !exibicaoGaResolvida &&
        !persistidoJaTemValor;
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
      /** Recalcula a ficha só com a aba Início aberta — keep-alive não pode travar a troca. */
      const gaParidadeWarm =
        tabAtiva &&
        isCooperadoMobilePilotPerfActive() &&
        isAppDataWarm() &&
        Boolean(input.cooperadoId) &&
        !persistidoJaTemValor &&
        !exibicaoGaResolvida;
      const needsMotor =
        cacheDivergeMotorLive ||
        syncMotorPass ||
        (!persistidoJaTemValor && persistidoTick > 0) ||
        pilotPrecisaMotorLocal ||
        Boolean(gaParidadeWarm) ||
        !persistidoMesmoBuildEarly?.display ||
        (!persistidoJaTemValor && input.dataReady && apresentacaoCard);

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

      const atualizarManual = Boolean(input.syncing && isCooperadoUserSyncVisible());
      const fromMotor =
        needsMotor && data && input.cooperadoId && cooperativaIdCard
          ? resolverCardInicioEndurecido({
              data,
              cooperadoId: input.cooperadoId,
              cooperativaId: cooperativaIdCard,
              apresentacaoConsolidada: apresentacaoCard,
              carregandoFinanceiro: carregandoFinanceiro && !apresentacaoCard,
              prevLatch: null,
              persistido: persistidoMesmoBuildEarly,
              dataReady: input.dataReady,
              syncing: input.syncing,
            })
          : null;

      if (
        fromMotor &&
        cooperadoMotorTemObrigacaoReceber(fromMotor.display)
      ) {
        const persistidoValor = persistidoMesmoBuildEarly?.display?.valor ?? 0;
        const mudou = Math.abs(fromMotor.display.valor - persistidoValor) > 0.005;
        return { ...fromMotor, gravarPersistencia: mudou };
      }

      const persistidoMesmoBuild = persistidoMesmoBuildEarly;
      const persistidoComObrigacao = persistidoJaTemValor;
      const financeiroCompleto = Boolean(
        data &&
          input.cooperadoId &&
          cooperativaIdCard &&
          cooperadoTemDadosFinanceirosMinimos(data, input.cooperadoId, cooperativaIdCard) &&
          !cooperadoFinanceiroDesatualizado(data, input.cooperadoId, cooperativaIdCard)
      );
      const motorZeradoComProva =
        atualizarManual &&
        Boolean(fromMotor) &&
        !cooperadoMotorTemObrigacaoReceber(fromMotor!.display) &&
        financeiroCompleto &&
        cooperadoBicAutorizaZerarCardInicio(data!, input.cooperadoId!, cooperativaIdCard!, {
          tinhaValorExibido: persistidoComObrigacao,
        });

      const displayEstavel = cooperadoInicioCardEscolherDisplayEstavel({
        persistido: persistidoMesmoBuild?.display,
        motor: fromMotor?.display,
        autorizaZerarCompleto: Boolean(motorZeradoComProva),
      });

      if (
        persistidoMesmoBuild?.display &&
        displayEstavel === persistidoMesmoBuild.display &&
        cooperadoMotorTemObrigacaoReceber(displayEstavel)
      ) {
        return {
          display: displayEstavel,
          latch: {
            motorRevision: persistidoMesmoBuild.motorRevision,
            display: displayEstavel,
            hadPendencia: true,
          },
          atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
          gravarPersistencia: false,
        };
      }

      if (motorZeradoComProva && fromMotor && displayEstavel === fromMotor.display) {
        return { ...fromMotor, gravarPersistencia: true };
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
          if (cooperadoMotorTemObrigacaoReceber(display)) {
            return {
              display,
              latch: {
                motorRevision: `fichaSnap:${fichaSnap.savedAt}`,
                display,
                hadPendencia: true,
              },
              atualizando: Boolean(input.syncing && isCooperadoUserSyncVisible()),
              gravarPersistencia: true,
            };
          }
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
          persistido: persistidoMesmoBuild,
          dataReady: input.dataReady,
          syncing: input.syncing,
        });
        if (cooperadoMotorTemObrigacaoReceber(motorLocal.display)) {
          return { ...motorLocal, gravarPersistencia: true };
        }
      }

      if (
        persistidoMesmoBuild?.display &&
        cooperadoMotorTemObrigacaoReceber(persistidoMesmoBuild.display) &&
        !cacheDivergeMotorLive
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

      if (
        reciboAssinadoLocal &&
        dataLatch &&
        input.cooperadoId &&
        cooperadoBicAutorizaZerarCardInicio(dataLatch, input.cooperadoId, cooperativaIdLatch)
      ) {
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

      if (
        persistidoMesmoBuild?.display &&
        cooperadoMotorTemObrigacaoReceber(persistidoMesmoBuild.display)
      ) {
        return {
          display: persistidoMesmoBuild.display,
          latch: {
            motorRevision: persistidoMesmoBuild.motorRevision,
            display: persistidoMesmoBuild.display,
            hadPendencia: true,
          },
          atualizando: !input.dataReady,
          gravarPersistencia: false,
        };
      }

      return {
        display: SNAPSHOT_VAZIO,
        latch: { motorRevision: "", display: SNAPSHOT_VAZIO, hadPendencia: false },
        atualizando: true,
        gravarPersistencia: false,
      };
    }
    return resolverCardInicioEndurecido({
      data: input.data,
      cooperadoId: input.cooperadoId,
      cooperativaId: input.cooperativaId,
      apresentacaoConsolidada: apresentacaoCard,
      carregandoFinanceiro,
      prevLatch: latchRef.current,
      persistido,
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
    tabAtiva,
    appDataWarmKey,
    sessionUser?.id,
    sessionUser?.cooperativaId,
    sessionUser?.role,
    apresentacaoCard,
    apresentacaoFinanceiroUi,
    cooperadoPagamentosHydrated,
    pilotoParidadeUnificada,
    paridadeJeferson?.valorLiquido,
    paridadeJeferson?.mesLabel,
    ...(leituraSomentePwa ? [] : [hbDescontosRevision]),
  ]);

  latchRef.current = resolved.latch;

  const snapshotExibido = useMemo(() => {
    if (pilotoParidadeUnificada && !leituraSomentePwa && paridadeJeferson) {
      return resolved.display;
    }
    if (
      cooperadoInicioSincronizadoComFinanceiro(sessionUser) &&
      !leituraSomentePwa &&
      (cooperadoMotorTemObrigacaoReceber(resolved.display) ||
        (input.cooperadoId &&
          input.cooperativaId &&
          isAppDataWarm() &&
          cooperadoBicAutorizaZerarCardInicio(
            getData(),
            input.cooperadoId,
            input.cooperativaId,
            { tinhaValorExibido: cooperadoMotorTemObrigacaoReceber(persistido?.display ?? SNAPSHOT_VAZIO) }
          )))
    ) {
      return resolved.display;
    }
    let base = resolved.display;
    if (
      !cooperadoMotorTemObrigacaoReceber(base) &&
      persistido?.display &&
      cooperadoMotorTemObrigacaoReceber(persistido.display)
    ) {
      base = persistido.display;
    }
    if (!input.cooperadoId) return base;
    const coopId = input.cooperativaId;
    const fichaSnap = coopId
      ? lerCooperadoPwaFichaResumoSnapshot(input.cooperadoId, coopId)
      : null;
    let fichaValor = fichaSnap?.paridade?.valorLiquido ?? fichaSnap?.consolidado?.valorLiquido ?? 0;
    let fichaMes = fichaSnap?.paridade?.mesLabel ?? fichaSnap?.consolidado?.mesLabel;
    const overlayLinhas = linhasOverlayDebitoHbAReceber(input.cooperadoId, coopId);
    let extrasFicha = fichaSnap?.paridade?.descontosExtras ?? [];
    let permitirQuedaPorHb = false;
    if (isAppDataWarm() && coopId) {
      const live = cooperadoLeituraFinanceiraExibicao(getData(), input.cooperadoId, coopId);
      extrasFicha = live.descontosExtras;
      const temDebitoHb = live.descontosExtras.some((d) => d.tipo === "conta_coop");
      if (live.valorLiquido > fichaValor) {
        fichaValor = live.valorLiquido;
        fichaMes = live.mesLabel;
      } else if (temDebitoHb && live.valorLiquido > 0.005 && live.valorLiquido + 0.005 < fichaValor) {
        fichaValor = live.valorLiquido;
        fichaMes = live.mesLabel;
      }
      permitirQuedaPorHb = temDebitoHb && fichaValor > 0.005;
    }
    const hibrido = escolherDebitoHbHibrido({
      linhasFicha: extrasFicha,
      linhasOverlay: overlayLinhas,
    });
    if (hibrido.fonte === "overlay" && hibrido.valorReais > 0.005) {
      const baseValor = cooperadoMotorTemObrigacaoReceber(base) ? base.valor : fichaValor;
      const alvo = aplicarDebitoHbHibridoNoValor(baseValor > 0.005 ? baseValor : fichaValor, hibrido.valorReais);
      if (alvo + 0.005 < (base.valor ?? 0) || alvo + 0.005 < fichaValor) {
        fichaValor = alvo;
        permitirQuedaPorHb = alvo > 0.005;
      }
    } else if (hibrido.fonte === "ficha" && hibrido.valorReais > 0.005) {
      permitirQuedaPorHb = fichaValor > 0.005;
    }
    return cooperadoInicioCardAlinharValorFicha(base, fichaValor, fichaMes, { permitirQuedaPorHb }) ?? base;
  }, [
    resolved.display,
    persistido,
    input.cooperadoId,
    input.cooperativaId,
    persistidoTick,
    appDataWarmKey,
    hbDescontosRevision,
    pilotoParidadeUnificada,
    paridadeJeferson,
    sessionUser?.id,
  ]);

  useEffect(() => {
    if (!input.cooperadoId) return;
    if (!cooperadoMotorTemObrigacaoReceber(snapshotExibido)) return;
    gravarInicioCardPersistidoFlex(input.cooperadoId, input.cooperativaId, {
      v: INICIO_CARD_STORAGE_VERSION,
      appBuild: APP_BUILD_VERSION,
      motorRevision: resolved.latch.motorRevision,
      display: sanitizeInicioCardSnapshotParaPersistenciaBic(snapshotExibido),
      savedAt: new Date().toISOString(),
    });
  }, [
    input.cooperadoId,
    input.cooperativaId,
    snapshotExibido,
    resolved.latch.motorRevision,
  ]);

  useEffect(() => {
    const cooperadoId = input.cooperadoId;
    if (!cooperadoId) return;
    const persistirAoFechar = () => {
      if (!cooperadoMotorTemObrigacaoReceber(snapshotExibido)) return;
      gravarInicioCardPersistidoFlex(cooperadoId, input.cooperativaId, {
        v: INICIO_CARD_STORAGE_VERSION,
        appBuild: APP_BUILD_VERSION,
        motorRevision: resolved.latch.motorRevision,
        display: sanitizeInicioCardSnapshotParaPersistenciaBic(snapshotExibido),
        savedAt: new Date().toISOString(),
      });
    };
    window.addEventListener("pagehide", persistirAoFechar);
    document.addEventListener("visibilitychange", persistirAoFechar);
    return () => {
      window.removeEventListener("pagehide", persistirAoFechar);
      document.removeEventListener("visibilitychange", persistirAoFechar);
    };
  }, [
    input.cooperadoId,
    input.cooperativaId,
    snapshotExibido,
    resolved.latch.motorRevision,
  ]);

  const exibicaoIndeterminada =
    sessionUser?.role === "cooperado" &&
    cooperadoGaValorReceberExibicaoIndeterminada(sessionUser, snapshotExibido);

  const valorJaNaTela = cooperadoMotorTemObrigacaoReceber(snapshotExibido);
  const atualizando = valorJaNaTela
    ? false
    : exibicaoIndeterminada ||
      resolved.atualizando ||
      Boolean(input.carregandoValoresFinanceiros) ||
      Boolean(input.syncing);

  return {
    snapshot: snapshotExibido,
    atualizando,
  };
}
