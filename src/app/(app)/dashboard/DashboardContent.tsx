"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import type { AppData, User } from "@/types";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useAppDataSelector,
  useAppDataReady,
  useAppDataDomainsRevisionWhenActive,
  useAppDataSelectorForDomainsWhenActive,
} from "@/hooks/useAppData";
import { useCooperadoTabPanelActive } from "@/hooks/useCooperadoTabPanelActive";
import { setCooperadoOptimisticTab } from "@/lib/performance/cooperadoOptimisticTabNavigation";
import { cooperadoTabWarmOnPointerDown } from "@/lib/performance/cooperadoTabPointerWarmup";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import { getData, getDataRevision, isAppDataWarm } from "@/services/dataStore";
import { useAuth } from "@/modules/auth/AuthProvider";
import { evaluateResponsavelPainelAbertura } from "@/lib/responsavel/responsavelPainelContrato";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import { shouldRenderStaffPainelUi } from "@/lib/staffNavigationUser";
import { StatCard } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import {
  CooperadoInicioAssinaturaOnboardingLive,
  CooperadoInicioCooperadoLiveRoot,
  CooperadoInicioOláTitulo,
} from "@/components/cooperado/CooperadoInicioCooperadoLiveLeaf";
import { CooperadoMensalidadesPagarPanel } from "@/components/cooperado/CooperadoMensalidadesPagarPanel";
import { ValoresAvulsosDashboardCard } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { getAdminStatsCached } from "@/services/dashboardService";
import { requestAdminStatsFromWorker } from "@/services/adminStatsWorkerClient";
import { isRqlAdminStatsWorkerEnabled } from "@/lib/performance/rqlAdminStats85";
import type { AdminDashboardStats } from "@/services/dashboardService";
import type { FilaDoDiaItem } from "@/services/filaDoDiaService";
import { getFilaDoDiaCached } from "@/services/filaDoDiaService";
import { FilaDoDiaPanel } from "@/components/dashboard/FilaDoDiaPanel";
const CooperadoHbCreditResumoCard = dynamic(
  () =>
    import("@/components/hb-credit/CooperadoHbCreditResumoCard").then(
      (m) => m.CooperadoHbCreditResumoCard
    ),
  { ssr: false, loading: () => null }
);
const ContaCoopFilaCloudPanel = dynamic(
  () =>
    import("@/components/hb-credit/ContaCoopFilaCloudPanel").then((m) => m.ContaCoopFilaCloudPanel),
  { ssr: false, loading: () => null }
);
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { bicCentralMesPrincipalQuantoVouReceber } from "@/services/bicLeituraCentralCooperado";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import {
  requestCooperadoFinanceiroRecoverySync,
  requestVotacaoOperacionalSync,
} from "@/services/syncRequest";
import {
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
  cooperadoGaValorReceberExibicaoResolvida,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { scheduleCooperadoGarantiaValorReceberUntilResolvido } from "@/lib/cooperado/cooperadoGaGarantiaValorReceberSync";
import { scheduleCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import { scheduleCooperadoGaPrimeiraCargaSilenciosa } from "@/lib/cooperado/cooperadoGaColdBootstrap";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { useCooperadoFluxoPadrao } from "@/hooks/useCooperadoFluxoPadrao";
import { useCooperadoInicioValorReceberCardState } from "@/hooks/useCooperadoInicioValorReceberCardState";
import { AvisosInicioSection } from "@/components/comunicado/AvisosInicioSection";
import { PrestacaoContasDashboardBanner } from "@/components/prestacao/PrestacaoContasDashboardBanner";
import { InicioResolvidosPanel } from "@/components/cooperado/InicioResolvidosPanel";
import {
  resumoAssinaturaCadastroApp,
} from "@/services/cooperadoAssinaturaService";
import { VotacaoPautasInicioPanel } from "@/components/votacao/VotacaoPautasInicioPanel";
import { VotacaoResultadoPanel } from "@/components/votacao/VotacaoResultadoPanel";
import { bicCentralBuildValorExibicaoCooperadoOpts } from "@/services/bicLeituraCentralFicha";
import { useSyncContaCoopValorReceberPilot } from "@/hooks/useSyncContaCoopValorReceberPilot";
import { useContaCoopDescontosRevisionWhenLive } from "@/hooks/useContaCoopDescontosRevision";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getUserCooperativaId, getUserCooperativaNome, normalizeCnpj } from "@/utils/cooperativa";
import { Camera, Wallet, ClipboardList, Users, Vote, Download, PenLine } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { resumoInstalacaoApp } from "@/services/cooperadoAppInstallService";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import {
  appLocalResumeReady,
  cooperadoInstantShellReady,
  cooperadoLocalResumeReady,
  isCooperadoInstantResumeEnabled,
  isCooperadoManualOperacionalSync,
  shouldSkipCooperadoSecondaryMountSync,
} from "@/lib/performance/cooperadoColdStart";
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";
import { RestoreOperacionalPanel } from "@/components/sync/RestoreOperacionalPanel";
import { CooperadoInicioValorReceberCard } from "@/components/cooperado/CooperadoInicioValorReceberCard";
import {
  COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT,
  isCooperadoPwaMobileLeveUi,
} from "@/lib/cooperado/cooperadoPwaLeveUi";
import {
  buildCooperadoPwaInicioDashboardView,
  persistirCooperadoPwaInicioDashboardSnapshot,
  type CooperadoPwaInicioDashboardView,
} from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { cooperadoPwaInstantPaintReady, lerCooperadoPwaInicioDashboardViewForResume } from "@/lib/cooperado/cooperadoPwaInstantResume";
import {
  cooperadoPwaUiSubscribesAppData,
  isCooperadoPwaMessengerMode,
} from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { isCooperadoAppUser } from "@/permissions";
import { getSession } from "@/services/dataStore";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoMobilePilotSnapshotFirstInicio } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import {
  scheduleCooperadoHbCreditLimiteAndAccountWarmup,
  scheduleCooperadoPilotHbCreditRouteWarmup,
} from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import { resolveCooperadoHbCreditCnpjDigits } from "@/lib/hb-credit/resolveCooperadoHbCreditCnpj";
import type { HbCreditFlagState } from "@/hooks/useHbCreditEnabled";

const DASHBOARD_INICIO_DOMAINS: AppDataNotifyDomain[] = ["shell", "notas", "financeiro", "operacional"];

function CooperadoHbCreditInicioSection({
  hbCredit,
  cnpjDigits,
}: {
  hbCredit: HbCreditFlagState;
  cnpjDigits: string;
}) {
  if (!hbCredit.navEnabled) return null;
  return <CooperadoHbCreditResumoCard cnpj={cnpjDigits.length === 14 ? cnpjDigits : ""} />;
}

function contaCoopValorReceberPilotOptsFromData(
  data: AppData | null,
  user: Omit<User, "password"> | null | undefined,
  apresentacaoConsolidada: boolean
) {
  if (!data || !user?.cooperadoId) return null;
  const coopId = getUserCooperativaId(user, data);
  if (!coopId) return null;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  const paridade = cooperadoLeituraFinanceiraExibicao(data, cooperadoId, coopId, {
    apresentacaoConsolidada,
  });
  const mesHb =
    paridade.mesesResumo[paridade.mesesResumo.length - 1] ??
    paridade.mesesResumo[0] ??
    bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, coopId, { apresentacaoConsolidada });
  const exibicaoOpts = bicCentralBuildValorExibicaoCooperadoOpts(data, cooperadoId, mesHb, coopId);
  return {
    cooperadoId,
    mesReferencia: exibicaoOpts.mesReferencia,
    cooperativaId: coopId,
    cooperadoNome: exibicaoOpts.cooperadoNome,
  };
}

function EnviarFotoEntregaInicioCard({ onEnviar }: { onEnviar: () => void }) {
  return (
    <div className="bg-white border-2 border-green-200 rounded-2xl p-6 flex flex-col justify-between">
      <div>
        <Camera size={28} className="text-green-700 mb-3" />
        <p className="font-semibold text-gray-900">Registrar entrega na escola</p>
        <p className="text-sm text-gray-500 mt-1">Tire foto do pedido assinado e envie para a cooperativa.</p>
      </div>
      <Button type="button" className="mt-4 w-full" size="lg" onClick={onEnviar}>
        Enviar foto da entrega
      </Button>
    </div>
  );
}

function CooperadoDashboard() {
  const tabActive = useCooperadoTabPanelActive("/dashboard");
  const messenger = isCooperadoPwaMessengerMode();
  const inicioPwaLeve = isCooperadoPwaMobileLeveUi();
  const appDataUiOn = cooperadoPwaUiSubscribesAppData() && tabActive;
  const { user } = useAuth();
  const inicioSnapshotFirst = inicioPwaLeve || cooperadoMobilePilotSnapshotFirstInicio(user);
  const router = useRouter();
  const irEnviarFotoEntrega = useCallback(() => {
    setCooperadoOptimisticTab("/notas-pedido");
    cooperadoTabWarmOnPointerDown("/notas-pedido");
    startTransition(() => {
      router.push("/notas-pedido?anexar=1");
    });
  }, [router]);
  const hbCredit = useHbCreditEnabled(user);
  const appDataReady = useAppDataReady();
  const cnpjHbDigits = useMemo(
    () => resolveCooperadoHbCreditCnpjDigits(user),
    [user?.id, user?.cooperativaId, user?.cooperativaCnpj, appDataReady]
  );
  const { syncingForUi, lastSyncedAt } = useSyncStatus();
  const fluxo = useCooperadoFluxoPadrao();
  const { apresentacaoConsolidada, carregandoValoresFinanceiros } = fluxo;
  const recoverySyncRef = useRef(false);
  const hbDescontosRevision = useContaCoopDescontosRevisionWhenLive(appDataUiOn);

  const financeiroAusente = useAppDataSelectorForDomainsWhenActive(
    appDataUiOn,
    DASHBOARD_INICIO_DOMAINS,
    (data) => {
      if (!data || !user?.cooperadoId) return false;
      const coopId = getUserCooperativaId(user, data);
      if (!coopId) return false;
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      return cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId);
    },
    [user?.id, user?.cooperadoId, user?.cooperativaId, hbDescontosRevision]
  );

  useEffect(() => {
    recoverySyncRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (!inicioSnapshotFirst) {
      warmupCooperadoFinanceiroTabChunk();
      return;
    }
    const warm = () => warmupCooperadoFinanceiroTabChunk();
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(warm, { timeout: 1_500 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(warm, 200);
    return () => window.clearTimeout(t);
  }, [inicioSnapshotFirst]);

  useEffect(() => {
    if (!hbCredit.navEnabled || !user) return;
    scheduleCooperadoPilotHbCreditRouteWarmup(user, (href) => router.prefetch(href));
  }, [hbCredit.navEnabled, user?.id, router]);

  useEffect(() => {
    if (!hbCredit.navEnabled || !user || user.role !== "cooperado") return;
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
  }, [hbCredit.navEnabled, user?.id, user?.cooperadoId]);

  useEffect(() => {
    if (messenger || isCooperadoManualOperacionalSync()) return;
    if (!user?.cooperadoId || typeof navigator === "undefined" || !navigator.onLine) return;
    if (shouldSkipCooperadoSecondaryMountSync()) return;
    requestVotacaoOperacionalSync();
  }, [messenger, user?.id, user?.cooperadoId]);

  useEffect(() => {
    if (
      !financeiroAusente ||
      recoverySyncRef.current ||
      typeof navigator === "undefined" ||
      !navigator.onLine
    ) {
      return;
    }
    if (user && isCooperadoMobileGaPromoted(user) && !cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) {
      return;
    }
    recoverySyncRef.current = true;
    requestCooperadoFinanceiroRecoverySync();
    scheduleCooperadoGaPrimeiraCargaSilenciosa(user ?? undefined);
  }, [financeiroAusente, user?.id, user?.role]);

  const contaCoopSync = useAppDataSelectorForDomainsWhenActive(
    appDataUiOn && hbCredit.navEnabled,
    DASHBOARD_INICIO_DOMAINS,
    (data) => contaCoopValorReceberPilotOptsFromData(data, user, apresentacaoConsolidada),
    [hbCredit.navEnabled, user?.id, user?.cooperadoId, user?.cooperativaId, hbDescontosRevision, apresentacaoConsolidada]
  );

  /** Modo mensageiro: HB só no runSync (Atualizar) — sem pilot periódico na UI. */
  useSyncContaCoopValorReceberPilot(
    !messenger && !inicioSnapshotFirst && contaCoopSync
      ? { ...contaCoopSync, user, initialDelayMs: 3_000 }
      : undefined
  );

  const inicioCardCtx = fluxo.cooperadoId
    ? {
        data: fluxo.data,
        cooperadoId: fluxo.cooperadoId,
        cooperativaId: fluxo.cooperativaId,
        dataReady: fluxo.dataReady,
      }
    : null;

  const cooperadoIdCard = inicioCardCtx?.cooperadoId ?? user?.cooperadoId;
  const cooperativaIdCard = inicioCardCtx?.cooperativaId ?? user?.cooperativaId;

  const { snapshot: valorReceberCard, atualizando: cardFinanceiroAtualizando } =
    useCooperadoInicioValorReceberCardState({
      data: inicioCardCtx?.data ?? null,
      cooperadoId: cooperadoIdCard,
      cooperativaId: cooperativaIdCard,
      dataReady: inicioCardCtx?.dataReady ?? isAppDataWarm(),
      syncing: syncingForUi,
      apresentacaoConsolidada,
      carregandoValoresFinanceiros,
      leituraSomentePwa: messenger || inicioSnapshotFirst,
    });

  const exibicaoZeroRecoveryRef = useRef(false);
  useEffect(() => {
    if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (!cooperadoGaValorReceberExibicaoResolvida(user)) {
      scheduleCooperadoGarantiaValorReceberUntilResolvido(user);
      scheduleCooperadoGaSyncBaseInformacoesFinanceiras(user, { force: true });
    }
    if (exibicaoZeroRecoveryRef.current) return;
    if (!cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) return;
    exibicaoZeroRecoveryRef.current = true;
    requestCooperadoFinanceiroRecoverySync();
    scheduleCooperadoGaPrimeiraCargaSilenciosa(user);
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
  }, [user?.id, user?.role, valorReceberCard.valor, hbCredit.navEnabled]);

  const [pwaInicioView, setPwaInicioView] = useState<CooperadoPwaInicioDashboardView | null>(() => {
    if (typeof window === "undefined" || !isCooperadoPwaMobileLeveUi()) return null;
    const session = getSession();
    if (!session?.cooperadoId) return null;
    return lerCooperadoPwaInicioDashboardViewForResume(
      session.cooperadoId,
      session.cooperativaId
    );
  });
  const pwaInicioViewStickyRef = useRef<CooperadoPwaInicioDashboardView | null>(pwaInicioView);
  if (pwaInicioView) pwaInicioViewStickyRef.current = pwaInicioView;

  const refreshPwaInicioView = useCallback(
    (opts?: { rebuildFromAppData?: boolean }) => {
      if (!inicioSnapshotFirst || !user?.cooperadoId) return;
      const coopId = cooperativaIdCard ?? user.cooperativaId;
      const cooperadoId = cooperadoIdCard ?? user.cooperadoId;
      if (!coopId || !cooperadoId) return;

      if (!opts?.rebuildFromAppData) {
        const fromResume = lerCooperadoPwaInicioDashboardViewForResume(cooperadoId, coopId);
        if (fromResume) {
          setPwaInicioView(fromResume);
          return;
        }
      }

      if (!isAppDataWarm()) return;
      const built = persistirCooperadoPwaInicioDashboardSnapshot(cooperadoId, coopId, user, true);
      if (built?.view) setPwaInicioView(built.view);
    },
    [inicioSnapshotFirst, user, cooperadoIdCard, cooperativaIdCard]
  );

  useEffect(() => {
    if (!messenger || !user?.cooperadoId) return;
    refreshPwaInicioView();
  }, [messenger, user?.id, user?.cooperadoId, cooperativaIdCard, cooperadoIdCard, refreshPwaInicioView]);

  useEffect(() => {
    if (!messenger || lastSyncedAt == null) return;
    // Sync provider já materializa snapshots; só reler cache local (evita rebuild duplo).
    refreshPwaInicioView();
  }, [messenger, lastSyncedAt, refreshPwaInicioView]);

  useEffect(() => {
    if (!inicioSnapshotFirst || !user?.cooperadoId) return;
    if (!apresentacaoConsolidada || lastSyncedAt == null) return;
    void import("@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh").then((mod) => {
      mod.cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(user);
      refreshPwaInicioView({ rebuildFromAppData: true });
    });
  }, [
    inicioSnapshotFirst,
    apresentacaoConsolidada,
    lastSyncedAt,
    user?.id,
    user?.cooperadoId,
    refreshPwaInicioView,
  ]);

  useEffect(() => {
    if (!inicioSnapshotFirst) return;
    const onRefresh = () => {
      // Snapshots já foram gravados pelo sync; só reler cache (evita rebuild pesado do AppData).
      refreshPwaInicioView();
    };
    window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT, onRefresh);
  }, [inicioSnapshotFirst, refreshPwaInicioView]);

  useLayoutEffect(() => {
    if (!inicioSnapshotFirst || !tabActive) return;
    refreshPwaInicioView();
  }, [inicioSnapshotFirst, tabActive, refreshPwaInicioView]);

  const inicioDomainsRevision = useAppDataDomainsRevisionWhenActive(appDataUiOn, DASHBOARD_INICIO_DOMAINS);
  const deferredInicioRevision = useDeferredValue(inicioDomainsRevision);

  const viewLive = useMemo(() => {
    if (!appDataUiOn || !deferredInicioRevision || !isAppDataWarm() || !user?.cooperadoId) return null;
    return buildCooperadoPwaInicioDashboardView(getData(), user, apresentacaoConsolidada);
  }, [
    appDataUiOn,
    deferredInicioRevision,
    user?.id,
    user?.cooperadoId,
    user?.cooperativaId,
    hbDescontosRevision,
    apresentacaoConsolidada,
  ]);

  const view =
    messenger || inicioSnapshotFirst ? pwaInicioView ?? pwaInicioViewStickyRef.current : viewLive;

  const mesAtual = getCurrentMesReferencia();
  const nomeFromSnapshot =
    view?.cooperado?.nomeCompleto.split(" ")[0] ??
    pwaInicioViewStickyRef.current?.cooperado?.nomeCompleto.split(" ")[0];
  const coopNomeEarly =
    view?.coopNome ?? (user && isAppDataWarm() ? getUserCooperativaNome(user, getData()) : "");

  return (
    <CooperadoInicioCooperadoLiveRoot
      cooperadoIdCard={cooperadoIdCard}
      cooperativaIdCard={cooperativaIdCard}
    >
      {!view ? (
        <div className="space-y-6 max-w-3xl">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              <CooperadoInicioOláTitulo nomeFromView={nomeFromSnapshot} />
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {coopNomeEarly ? `${coopNomeEarly} · ` : ""}
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
          <CooperadoHbCreditInicioSection hbCredit={hbCredit} cnpjDigits={cnpjHbDigits} />
        </div>
      ) : (
        <CooperadoDashboardInicioView
          view={view}
          valorReceberCard={valorReceberCard}
          cardFinanceiroAtualizando={cardFinanceiroAtualizando}
          irEnviarFotoEntrega={irEnviarFotoEntrega}
          hbCredit={hbCredit}
          cnpjHbFallback={cnpjHbDigits}
        />
      )}
    </CooperadoInicioCooperadoLiveRoot>
  );
}

function CooperadoDashboardInicioView({
  view,
  valorReceberCard,
  cardFinanceiroAtualizando,
  irEnviarFotoEntrega,
  hbCredit,
  cnpjHbFallback,
}: {
  view: CooperadoPwaInicioDashboardView;
  valorReceberCard: ReturnType<typeof useCooperadoInicioValorReceberCardState>["snapshot"];
  cardFinanceiroAtualizando: boolean;
  irEnviarFotoEntrega: () => void;
  hbCredit: ReturnType<typeof useHbCreditEnabled>;
  cnpjHbFallback: string;
}) {
  const {
    cooperadoId,
    mes,
    cooperado,
    coopNome,
    precisaPix,
    rejeitadas,
    fotosEmAnalise,
    exibirCardAvulsosSeparado,
    comunicados,
    pautasAbertas,
    resultadoVotacao,
    resolvidos,
    temSecaoPendencias,
    coopId: viewCoopId,
    mostrarAssinaturaPilot,
    cnpjDigits,
  } = view;

  const nomePrimeiro = cooperado?.nomeCompleto.split(" ")[0];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          <CooperadoInicioOláTitulo nomeFromView={nomePrimeiro} />
        </h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

      <CooperadoInicioAssinaturaOnboardingLive
        cooperado={cooperado}
        cooperadoId={cooperadoId}
        mostrarAssinaturaPilot={mostrarAssinaturaPilot}
        precisaPix={precisaPix}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CooperadoInicioValorReceberCard
          snapshot={valorReceberCard}
          atualizando={cardFinanceiroAtualizando}
          exibirReciboAssinatura
        />

        <EnviarFotoEntregaInicioCard onEnviar={irEnviarFotoEntrega} />
      </div>

      {pautasAbertas.length > 0 && <VotacaoPautasInicioPanel pautas={pautasAbertas} />}

      {pautasAbertas.length === 0 && resultadoVotacao && (
        <VotacaoResultadoPanel resumo={resultadoVotacao.resumo} />
      )}

      <CooperadoMensalidadesPagarPanel cooperadoId={cooperadoId} />

      <AvisosInicioSection comunicados={comunicados} hideWhenEmpty />

      {exibirCardAvulsosSeparado && (
        <ValoresAvulsosDashboardCard cooperadoId={cooperadoId} cooperativaId={viewCoopId} />
      )}

      {temSecaoPendencias && (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pendências</p>
      )}

      {rejeitadas.length > 0 && (
        <AlertBanner variant="error" title="Entrega precisa de correção">
          Você tem {rejeitadas.length} entrega(s) que a cooperativa pediu para corrigir.{" "}
          <Link href="/notas-pedido" className="font-semibold underline">Ver e enviar de novo</Link>
        </AlertBanner>
      )}

      {fotosEmAnalise > 0 && (
        <AlertBanner variant="info" title="Entregas em análise">
          {fotosEmAnalise} foto{fotosEmAnalise === 1 ? "" : "s"} aguardando conferência da cooperativa. Você será avisado quando o valor for lançado.
        </AlertBanner>
      )}

      <CooperadoHbCreditInicioSection
        hbCredit={hbCredit}
        cnpjDigits={cnpjDigits.length === 14 ? cnpjDigits : cnpjHbFallback}
      />

      <InicioResolvidosPanel itens={resolvidos} />
    </div>
  );
}

function AdminDashboard() {
  const { user, accountUser } = useAuth();
  const navUser = useAppDataSelector(
    (data) => {
      if (!user) return null;
      const staff = Boolean(accountUser && shouldRenderStaffPainelUi(accountUser, data));
      return (staff ? accountUser : user) ?? user;
    },
    [user?.id, accountUser?.id, accountUser?.role]
  );
  const { check } = usePermissions();
  const creditFlag = useHbCreditEnabled(navUser ?? undefined);
  const { syncing } = useSyncStatus();

  const meta = useAppDataSelector((data) => {
    if (!data || !navUser) return null;
    const coopId = getUserCooperativaId(navUser, data);
    const coopNome = getUserCooperativaNome(navUser, data);
    const mes = getCurrentMesReferencia();
    const instalacao = coopId ? resumoInstalacaoApp(data, coopId) : null;
    const assinatura = coopId ? resumoAssinaturaCadastroApp(data, coopId) : null;
    let cnpj = "";
    if (navUser.cooperativaCnpj) cnpj = normalizeCnpj(navUser.cooperativaCnpj);
    else {
      const coop = data.cooperativas.find((c) => c.id === coopId);
      if (coop?.cnpj) cnpj = normalizeCnpj(coop.cnpj);
    }
    return { coopNome, mes, instalacao, assinatura, cnpj, coopId: coopId ?? "" };
  }, [navUser?.id, navUser?.cooperativaId, navUser?.role]);

  const dataRevision = useAppDataSelector(() => getDataRevision(), []);
  const deferredRevision = useDeferredValue(dataRevision ?? -1);

  const adminStatsWorker = isRqlAdminStatsWorkerEnabled();
  const [workerHeavy, setWorkerHeavy] = useState<{
    stats: AdminDashboardStats;
    fila: FilaDoDiaItem[];
  } | null>(null);

  const quickStats = useMemo(() => {
    if (!meta || deferredRevision == null || deferredRevision < 0) return null;
    return getAdminStatsCached(getData(), meta.coopId || undefined, { skipValoresAPagar: true });
  }, [deferredRevision, meta?.coopId]);

  const heavy = useMemo(() => {
    if (adminStatsWorker || !meta || deferredRevision == null || deferredRevision < 0) return null;
    const d = getData();
    const coopScope = meta.coopId || undefined;
    return {
      stats: getAdminStatsCached(d, coopScope),
      fila: getFilaDoDiaCached(d, coopScope, meta.mes),
    };
  }, [adminStatsWorker, deferredRevision, meta?.coopId, meta?.mes]);

  useEffect(() => {
    if (!adminStatsWorker || !meta || deferredRevision == null || deferredRevision < 0) {
      setWorkerHeavy(null);
      return;
    }
    let cancelled = false;
    const d = getData();
    const coopScope = meta.coopId || undefined;
    const fila = getFilaDoDiaCached(d, coopScope, meta.mes);
    void requestAdminStatsFromWorker(d, coopScope, undefined, deferredRevision).then((stats) => {
      if (!cancelled) setWorkerHeavy({ stats, fila });
    });
    return () => {
      cancelled = true;
    };
  }, [adminStatsWorker, deferredRevision, meta?.coopId, meta?.mes]);

  if (!navUser || !meta) return <PageSkeleton />;

  const { coopNome, mes, instalacao, assinatura, cnpj, coopId } = meta;
  const stats = workerHeavy?.stats ?? heavy?.stats ?? quickStats;
  const fila = workerHeavy?.fila ?? heavy?.fila ?? [];
  const totaisFinanceirosPendentes =
    adminStatsWorker ? !workerHeavy?.stats : !heavy?.stats && Boolean(quickStats);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel da cooperativa</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
        {(syncing || totaisFinanceirosPendentes) && (
          <p className="text-xs text-gray-500 mt-1">Atualizando totais…</p>
        )}
      </div>

      {cnpj.length === 14 && coopId && (
        <RestoreOperacionalPanel cnpj={cnpj} coopId={coopId} />
      )}

      {instalacao && instalacao.semApp > 0 && (
        <Link
          href="/cooperados"
          className="flex items-center gap-4 rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 hover:border-amber-300 transition-colors"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600 text-white shrink-0">
            <Download size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-gray-900">
              {instalacao.semApp} cooperado{instalacao.semApp === 1 ? "" : "s"} sem o app
            </span>
            <span className="block text-sm text-gray-600 mt-0.5">
              {instalacao.comApp} já instalaram · veja a lista em Cooperados
            </span>
          </span>
          <span className="text-sm font-semibold text-amber-800 shrink-0">Ver →</span>
        </Link>
      )}

      {assinatura && assinatura.comApp > 0 && assinatura.emAnalise > 0 && (
        <Link
          href="/cooperados"
          className="flex items-center gap-4 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 px-5 py-4 hover:border-amber-400 transition-colors"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-600 text-white shrink-0">
            <PenLine size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-gray-900">
              {assinatura.emAnalise} assinatura{assinatura.emAnalise === 1 ? "" : "s"} aguardando análise
            </span>
            <span className="block text-sm text-gray-600 mt-0.5">
              Confira em Cooperados se a foto está conforme e confirme ou devolva para reenvio
            </span>
          </span>
          <span className="text-sm font-semibold text-amber-800 shrink-0">Conferir →</span>
        </Link>
      )}

      {assinatura && assinatura.comApp > 0 && assinatura.semAssinatura > 0 && (
        <Link
          href="/cooperados"
          className="flex items-center gap-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4 hover:border-indigo-300 transition-colors"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0">
            <PenLine size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-gray-900">
              {assinatura.semAssinatura} cooperado{assinatura.semAssinatura === 1 ? "" : "s"} sem assinatura
            </span>
            <span className="block text-sm text-gray-600 mt-0.5">
              {assinatura.comAssinatura} de {assinatura.comApp} que aderiram ao app já enviaram · peça o cadastro em Meu cadastro
            </span>
          </span>
          <span className="text-sm font-semibold text-indigo-700 shrink-0">Ver →</span>
        </Link>
      )}

      {check("votacoes", "view") && (
        <Link
          href="/votacoes"
          className="flex items-center gap-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4 hover:border-indigo-300 transition-colors"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0">
            <Vote size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-gray-900">Votações</span>
            <span className="block text-sm text-gray-600 mt-0.5">
              Criar pauta, lançar enquete e publicar resultado para os cooperados
            </span>
          </span>
          <span className="text-sm font-semibold text-indigo-700 shrink-0">Abrir →</span>
        </Link>
      )}

      {heavy ? (
        <FilaDoDiaPanel items={fila} />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 animate-pulse min-h-[8rem]" aria-busy="true" />
      )}

      {creditFlag.navEnabled && check("conta_coop", "view") && cnpj.length === 14 && (
        <Link
          href="/conta-coop"
          className="flex items-center gap-4 rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 px-5 py-4 hover:border-emerald-300 transition-colors"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-700 text-white shrink-0">
            <Wallet size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-gray-900">HB Créditos</span>
            <span className="block text-sm text-gray-600 mt-0.5">
              Limites, mercados parceiros, liquidação e estornos
            </span>
          </span>
          <span className="text-sm font-semibold text-emerald-800 shrink-0">Abrir →</span>
        </Link>
      )}

      {creditFlag.enabled && cnpj.length === 14 && <ContaCoopFilaCloudPanel cnpj={cnpj} />}

      {stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="A pagar aos cooperados"
            value={
              totaisFinanceirosPendentes ? "…" : formatCurrency(stats.valoresAPagar)
            }
            icon={<Wallet size={24} />}
            variant="warning"
          />
          <StatCard
            title="Entregas p/ conferir"
            value={String(stats.entregasPendentes)}
            icon={<ClipboardList size={24} />}
            variant="gold"
          />
          <StatCard
            title="Cooperados ativos"
            value={String(stats.cooperadosAtivos)}
            icon={<Users size={24} />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
          <div className="h-24 bg-white rounded-xl border border-gray-200" />
          <div className="h-24 bg-white rounded-xl border border-gray-200" />
          <div className="h-24 bg-white rounded-xl border border-gray-200" />
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user, accountUser } = useAuth();
  const authSubject = accountUser ?? user;
  const dataReady = useAppDataReady();
  const instantResume =
    isCooperadoInstantResumeEnabled() &&
    Boolean(user) &&
    (user?.role === "cooperado"
      ? cooperadoInstantShellReady(user) ||
        cooperadoPwaInstantPaintReady(user) ||
        (isCooperadoPwaMobileLeveUi()
          ? false
          : cooperadoLocalResumeReady(user))
      : appLocalResumeReady(user));
  const dataRevision = useAppDataSelector(() => (isAppDataWarm() ? getDataRevision() : -1), []);
  const painelAbertura = useMemo(() => {
    const data = isAppDataWarm() ? getData() : null;
    const warmReady = Boolean(dataReady && data);
    return evaluateResponsavelPainelAbertura({
      accountUser,
      authSubject,
      data,
      dataReady: warmReady,
    });
  }, [
    dataReady,
    dataRevision,
    accountUser?.id,
    accountUser?.role,
    accountUser?.cooperadoId,
    authSubject?.id,
    authSubject?.role,
    authSubject?.cooperadoId,
    authSubject?.cooperativaId,
  ]);

  if (!authSubject) return <PageSkeleton />;

  const abrirGestao =
    painelAbertura.showAdminPainel ||
    (painelAbertura.canGestao && !isMobileCooperativaApp());

  if (abrirGestao) {
    if (!dataReady) return <PageSkeleton />;
    return <AdminDashboard />;
  }

  if (isCooperadoAppUser(authSubject)) {
    return <CooperadoDashboard />;
  }

  if (painelAbertura.canGestao) {
    if (!dataReady) return <PageSkeleton />;
    return <AdminDashboard />;
  }

  if (!dataReady && !instantResume) return <PageSkeleton />;

  return <PageSkeleton />;
}
