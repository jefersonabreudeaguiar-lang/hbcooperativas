"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useAppDataSelector,
  useAppDataReady,
  useAppDataSelectorForDomainsWhenActive,
} from "@/hooks/useAppData";
import { useCooperadoTabPanelActive } from "@/hooks/useCooperadoTabPanelActive";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import { getData, getDataRevision } from "@/services/dataStore";
import { useAuth } from "@/modules/auth/AuthProvider";
import { shouldRenderStaffPainelUi } from "@/lib/staffNavigationUser";
import {
  canAccessPainelResponsavel,
  canAccessPainelResponsavelSession,
} from "@/lib/security/responsavelPanelAccess";
import { StatCard } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { OnboardingChecklist } from "@/components/cooperado/OnboardingChecklist";
import { AssinaturaStatusAviso } from "@/components/cooperado/AssinaturaStatusAviso";
import { CooperadoMensalidadesPagarPanel } from "@/components/cooperado/CooperadoMensalidadesPagarPanel";
import { ValoresAvulsosDashboardCard } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { getAdminStatsCached } from "@/services/dashboardService";
import { requestAdminStatsFromWorker } from "@/services/adminStatsWorkerClient";
import { isRqlAdminStatsWorkerEnabled } from "@/lib/performance/rqlAdminStats85";
import type { AdminDashboardStats } from "@/services/dashboardService";
import type { FilaDoDiaItem } from "@/services/filaDoDiaService";
import { getFilaDoDiaCached } from "@/services/filaDoDiaService";
import { FilaDoDiaPanel } from "@/components/dashboard/FilaDoDiaPanel";
import { CooperadoHbCreditResumoCard } from "@/components/hb-credit/CooperadoHbCreditResumoCard";
import { ContaCoopFilaCloudPanel } from "@/components/hb-credit/ContaCoopFilaCloudPanel";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import {
  contarFotosEmAnaliseCooperado,
  listarNotasPendentesCooperado,
} from "@/services/cooperadoEntregasService";
import {
  bicCentralMesPrincipalQuantoVouReceber,
  bicCentralResolveInicioParaExibicao,
} from "@/services/bicLeituraCentralCooperado";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { leituraFinanceiraParidadeCooperado } from "@/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import {
  requestCooperadoFinanceiroRecoverySync,
  requestVotacaoOperacionalSync,
} from "@/services/syncRequest";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { useCooperadoFluxoPadrao } from "@/hooks/useCooperadoFluxoPadrao";
import { useCooperadoInicioValorReceberCardState } from "@/hooks/useCooperadoInicioValorReceberCardState";
import { getComunicadosInicioCooperado } from "@/services/comunicadoService";
import {
  bicCentralGetResumoMensalidadesCooperado,
  bicCentralTotalValoresAvulsosPendentes,
} from "@/services/bicLeituraCentralDominios";
import { prestacaoPrincipalCooperado, prestacaoExigeAtencaoCooperado } from "@/services/prestacaoContasService";
import { AvisosInicioSection } from "@/components/comunicado/AvisosInicioSection";
import { PrestacaoContasDashboardBanner } from "@/components/prestacao/PrestacaoContasDashboardBanner";
import { InicioResolvidosPanel } from "@/components/cooperado/InicioResolvidosPanel";
import { listarResolvidosInicioCooperado } from "@/services/cooperadoInicioResolvidosService";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import {
  cooperadoPrecisaCadastrarAssinatura,
  resumoAssinaturaCadastroApp,
} from "@/services/cooperadoAssinaturaService";
import { listPautasAbertasCooperado, resultadoVisivelCooperado } from "@/services/votacaoService";
import { VotacaoPautasInicioPanel } from "@/components/votacao/VotacaoPautasInicioPanel";
import { VotacaoResultadoPanel } from "@/components/votacao/VotacaoResultadoPanel";
import { getCooperativaCnpj, getPendingNotaDeleteIds } from "@/services/notaPedidoCloudService";
import { bicCentralBuildValorExibicaoCooperadoOpts } from "@/services/bicLeituraCentralFicha";
import { useSyncContaCoopValorReceberPilot } from "@/hooks/useSyncContaCoopValorReceberPilot";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getUserCooperativaId, getUserCooperativaNome, normalizeCnpj } from "@/utils/cooperativa";
import { Camera, Wallet, ClipboardList, Users, Vote, Download, PenLine } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cooperadoTemAppInstalado, isAppStandalone, resumoInstalacaoApp } from "@/services/cooperadoAppInstallService";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import {
  appLocalResumeReady,
  cooperadoLocalResumeReady,
  isCooperadoInstantResumeEnabled,
  isCooperadoManualOperacionalSync,
  shouldSkipCooperadoSecondaryMountSync,
} from "@/lib/performance/cooperadoColdStart";
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";
import { RestoreOperacionalPanel } from "@/components/sync/RestoreOperacionalPanel";
import { CooperadoInicioValorReceberCard } from "@/components/cooperado/CooperadoInicioValorReceberCard";

const DASHBOARD_INICIO_DOMAINS: AppDataNotifyDomain[] = ["shell", "notas", "financeiro", "operacional"];

function CooperadoDashboard() {
  const tabActive = useCooperadoTabPanelActive("/dashboard");
  const { user } = useAuth();
  const router = useRouter();
  const hbCredit = useHbCreditEnabled(user);
  const { syncingForUi } = useSyncStatus();
  const fluxo = useCooperadoFluxoPadrao();
  const { apresentacaoConsolidada, carregandoValoresFinanceiros } = fluxo;
  const recoverySyncRef = useRef(false);
  const hbDescontosRevision = useContaCoopDescontosRevision();

  const financeiroAusente = useAppDataSelectorForDomainsWhenActive(
    tabActive,
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
    warmupCooperadoFinanceiroTabChunk();
  }, []);

  useEffect(() => {
    if (isCooperadoManualOperacionalSync()) return;
    if (!user?.cooperadoId || typeof navigator === "undefined" || !navigator.onLine) return;
    if (shouldSkipCooperadoSecondaryMountSync()) return;
    requestVotacaoOperacionalSync();
  }, [user?.id, user?.cooperadoId]);

  useEffect(() => {
    if (!financeiroAusente || recoverySyncRef.current || typeof navigator === "undefined" || !navigator.onLine) {
      return;
    }
    recoverySyncRef.current = true;
    requestCooperadoFinanceiroRecoverySync();
  }, [financeiroAusente]);

  const contaCoopSync = useAppDataSelectorForDomainsWhenActive(
    tabActive,
    DASHBOARD_INICIO_DOMAINS,
    (data) => {
      if (!data || !user?.cooperadoId) return null;
      const coopId = getUserCooperativaId(user, data);
      if (!coopId) return null;
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      const paridade = leituraFinanceiraParidadeCooperado(data, cooperadoId, coopId);
      const mesHb =
        paridade.mesesResumo[0] ??
        bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, coopId, { apresentacaoConsolidada });
      const exibicaoOpts = bicCentralBuildValorExibicaoCooperadoOpts(data, cooperadoId, mesHb, coopId);
      return {
        cooperadoId,
        mesReferencia: exibicaoOpts.mesReferencia,
        cooperativaId: coopId,
        cooperadoNome: exibicaoOpts.cooperadoNome,
      };
    },
    [user?.id, user?.cooperadoId, user?.cooperativaId, hbDescontosRevision, apresentacaoConsolidada]
  );

  useSyncContaCoopValorReceberPilot(
    contaCoopSync ? { ...contaCoopSync, user, initialDelayMs: 3_000 } : undefined
  );

  const inicioCardCtx = fluxo.cooperadoId
    ? {
        data: fluxo.data,
        cooperadoId: fluxo.cooperadoId,
        cooperativaId: fluxo.cooperativaId,
        dataReady: fluxo.dataReady,
      }
    : null;

  const { snapshot: valorReceberCard, atualizando: cardFinanceiroAtualizando } =
    useCooperadoInicioValorReceberCardState({
      data: inicioCardCtx?.data ?? null,
      cooperadoId: inicioCardCtx?.cooperadoId,
      cooperativaId: inicioCardCtx?.cooperativaId,
      dataReady: inicioCardCtx?.dataReady ?? false,
      syncing: syncingForUi,
      apresentacaoConsolidada,
      carregandoValoresFinanceiros,
    });

  const view = useAppDataSelectorForDomainsWhenActive(
    tabActive,
    DASHBOARD_INICIO_DOMAINS,
    (data) => {
    if (!data || !user?.cooperadoId) return null;

    const coopId = getUserCooperativaId(user, data);
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    const mes = getCurrentMesReferencia();
    const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
    const coopNome = getUserCooperativaNome(user, data);
    const valorReceber = bicCentralResolveInicioParaExibicao(data, cooperadoId, coopId, {
      apresentacaoConsolidada,
    });
    const precisaPix = cooperado ? cooperadoPrecisaCadastrarPix(cooperado.chavePix, cooperado.pixValido) : false;
    const notasPendentes = listarNotasPendentesCooperado(data, cooperadoId, coopId);
    const rejeitadas = notasPendentes.filter((n) => n.status === "rejeitada");
    const cnpj = coopId ? getCooperativaCnpj(data, coopId) : undefined;
    const pendingDeletes = cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
    const notasEmAnalise = notasPendentes.filter(
      (n) => n.status === "aguardando_conferencia" && !pendingDeletes.has(n.id)
    );
    const fotosEmAnalise = contarFotosEmAnaliseCooperado(notasEmAnalise);
    const resumoMens = bicCentralGetResumoMensalidadesCooperado(data, cooperadoId, coopId);
    const mensalidadeAberta = resumoMens.situacao === "atrasada";
    const prestacao = coopId ? prestacaoPrincipalCooperado(data, cooperadoId, coopId) : undefined;
    const prestacaoAberta = prestacao ? prestacaoExigeAtencaoCooperado(prestacao) : false;
    const avulsosPendentesTotal = bicCentralTotalValoresAvulsosPendentes(data, cooperadoId, undefined, coopId);
    const avulsosJaNoCardPrincipal =
      valorReceber.exibir &&
      (valorReceber.meses.length > 0
        ? valorReceber.meses.some((m) => bicCentralTotalValoresAvulsosPendentes(data, cooperadoId, m, coopId) > 0)
        : bicCentralTotalValoresAvulsosPendentes(data, cooperadoId, valorReceber.mes, coopId) > 0);
    const exibirCardAvulsosSeparado = avulsosPendentesTotal > 0 && !avulsosJaNoCardPrincipal;
    const comunicados = coopId ? getComunicadosInicioCooperado(data, coopId, cooperadoId) : [];
    const pautasAbertas = coopId ? listPautasAbertasCooperado(data, coopId, cooperadoId) : [];
    const resultadoVotacao = coopId ? resultadoVisivelCooperado(data, coopId) : null;
    const resolvidos = listarResolvidosInicioCooperado(data, cooperadoId, coopId);
    const mostrarAssinaturaPilot = cooperadoUsaAssinaturaCadastroPilot(cooperadoId);
    const precisaAssinatura =
      mostrarAssinaturaPilot && cooperadoPrecisaCadastrarAssinatura(cooperadoId, cooperado);
    const temSecaoPendencias =
      rejeitadas.length > 0 ||
      fotosEmAnalise > 0 ||
      valorReceber.exibir ||
      valorReceber.valor > 0 ||
      precisaPix ||
      precisaAssinatura ||
      mensalidadeAberta ||
      prestacaoAberta ||
      exibirCardAvulsosSeparado;
    const mostrarBaixarApp =
      Boolean(cooperado) &&
      !cooperado!.avulso &&
      !isAppStandalone() &&
      !cooperadoTemAppInstalado(cooperado!);

    const cnpjDigits = cnpj ? normalizeCnpj(cnpj) : "";

    return {
      cooperadoId,
      mes,
      cooperado,
      coopNome,
      valorReceber,
      precisaPix,
      rejeitadas,
      fotosEmAnalise,
      mensalidadeAberta,
      prestacao,
      prestacaoAberta,
      exibirCardAvulsosSeparado,
      comunicados,
      pautasAbertas,
      resultadoVotacao,
      resolvidos,
      temSecaoPendencias,
      mostrarBaixarApp,
      coopId,
      mostrarAssinaturaPilot,
      precisaAssinatura,
      cnpjDigits,
    };
  },
    [user?.id, user?.cooperadoId, user?.cooperativaId, hbDescontosRevision, apresentacaoConsolidada]
  );

  const mesAtual = getCurrentMesReferencia();
  const nomeCurto =
    view?.cooperado?.nomeCompleto.split(" ")[0] ?? user?.name?.split(" ")[0] ?? "Cooperado";
  const coopNomeEarly = view?.coopNome ?? "";

  if (!view) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Olá, {nomeCurto}!</h1>
          <p className="text-sm text-gray-500 mt-1">
            {coopNomeEarly ? `${coopNomeEarly} · ` : ""}
            {formatMesReferencia(mesAtual)}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CooperadoInicioValorReceberCard
            snapshot={valorReceberCard}
            atualizando={cardFinanceiroAtualizando}
          />
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 animate-pulse min-h-[12rem]" />
        </div>
      </div>
    );
  }

  const {
    cooperadoId,
    mes,
    cooperado,
    coopNome,
    valorReceber,
    precisaPix,
    rejeitadas,
    fotosEmAnalise,
    prestacao,
    exibirCardAvulsosSeparado,
    comunicados,
    pautasAbertas,
    resultadoVotacao,
    resolvidos,
    temSecaoPendencias,
    mostrarBaixarApp,
    coopId: viewCoopId,
    mostrarAssinaturaPilot,
    precisaAssinatura,
    cnpjDigits,
  } = view;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {cooperado?.nomeCompleto.split(" ")[0]}!</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

      {cooperado && <AssinaturaStatusAviso cooperado={cooperado} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CooperadoInicioValorReceberCard
          snapshot={valorReceberCard}
          atualizando={cardFinanceiroAtualizando}
        />

        <div className="bg-white border-2 border-green-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <Camera size={28} className="text-green-700 mb-3" />
            <p className="font-semibold text-gray-900">Registrar entrega na escola</p>
            <p className="text-sm text-gray-500 mt-1">Tire foto do pedido assinado e envie para a cooperativa.</p>
          </div>
          <Button className="mt-4 w-full" size="lg" onClick={() => router.push("/notas-pedido?anexar=1")}>
            Enviar foto da entrega
          </Button>
        </div>
      </div>

      {mostrarBaixarApp && (
        <Link
          href="/baixar-app"
          className="flex items-center gap-4 rounded-2xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 px-5 py-4 hover:border-green-400 transition-colors"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-700 text-white shrink-0">
            <Download size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-gray-900">Baixar aplicativo</span>
            <span className="block text-sm text-gray-600 mt-0.5">
              Android e iPhone — adicione à tela inicial e use sem abrir o navegador
            </span>
          </span>
          <span className="text-sm font-semibold text-green-800 shrink-0">Ver como →</span>
        </Link>
      )}

      {pautasAbertas.length > 0 && <VotacaoPautasInicioPanel pautas={pautasAbertas} />}

      {pautasAbertas.length === 0 && resultadoVotacao && (
        <VotacaoResultadoPanel resumo={resultadoVotacao.resumo} />
      )}

      <CooperadoMensalidadesPagarPanel cooperadoId={cooperadoId} />

      <AvisosInicioSection comunicados={comunicados} hideWhenEmpty />

      {exibirCardAvulsosSeparado && (
        <ValoresAvulsosDashboardCard cooperadoId={cooperadoId} cooperativaId={viewCoopId} />
      )}

      <OnboardingChecklist
        pixOk={!precisaPix}
        mostrarAssinatura={mostrarAssinaturaPilot}
        assinaturaOk={!precisaAssinatura}
      />

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

      {hbCredit.navEnabled && cnpjDigits.length === 14 && (
        <CooperadoHbCreditResumoCard cnpj={cnpjDigits} />
      )}

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
    (user?.role === "cooperado" ? cooperadoLocalResumeReady(user) : appLocalResumeReady(user));
  const staffPainelUi = useAppDataSelector(
    (data) => Boolean(accountUser && shouldRenderStaffPainelUi(accountUser, data)),
    [accountUser?.id, accountUser?.role]
  );
  const canGestaoFromData = useAppDataSelector(
    (data) => (authSubject ? canAccessPainelResponsavel(authSubject, data) : false),
    [authSubject?.id, authSubject?.role, authSubject?.cooperadoId, authSubject?.cooperativaId]
  );
  const canGestao = dataReady
    ? canGestaoFromData
    : authSubject
      ? canAccessPainelResponsavelSession(authSubject)
      : false;

  if (!user) return <PageSkeleton />;
  if (!dataReady && !instantResume) return <PageSkeleton />;

  if (canGestao && staffPainelUi) {
    return <AdminDashboard />;
  }

  return <CooperadoDashboard />;
}
