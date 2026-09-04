"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { getData } from "@/services/dataStore";
import { isCooperadoAppUser, isDiretoriaRole } from "@/permissions";
import { canAccessPainelResponsavel } from "@/lib/security/responsavelPanelAccess";
import { StatCard } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { OnboardingChecklist } from "@/components/cooperado/OnboardingChecklist";
import { CooperadoMensalidadesPagarPanel } from "@/components/cooperado/CooperadoMensalidadesPagarPanel";
import { ValoresAvulsosDashboardCard } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { getAdminStats } from "@/services/dashboardService";
import { getFilaDoDia } from "@/services/filaDoDiaService";
import { FilaDoDiaPanel } from "@/components/dashboard/FilaDoDiaPanel";
import { ContaCoopFilaCloudPanel } from "@/components/hb-credit/ContaCoopFilaCloudPanel";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import {
  cooperadoExibirValorReceberInicio,
  contarFotosEmAnaliseCooperado,
  getMesPrincipalQuantoVouReceber,
  getValorQuantoVouReceber,
  listarNotasPendentesCooperado,
} from "@/services/cooperadoEntregasService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { cooperadoFinanceiroDesatualizado } from "@/services/fichaSyncGuard";
import { requestAppSyncImmediate, requestVotacaoOperacionalSync } from "@/services/syncRequest";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import { getComunicadosInicioCooperado } from "@/services/comunicadoService";
import { getResumoMensalidadesCooperado } from "@/services/mensalidadeService";
import { prestacaoPrincipalCooperado, prestacaoExigeAtencaoCooperado } from "@/services/prestacaoContasService";
import { totalValoresAvulsosPendentes } from "@/services/valoresAvulsosReceberService";
import { AvisosInicioSection } from "@/components/comunicado/AvisosInicioSection";
import { PrestacaoContasDashboardBanner } from "@/components/prestacao/PrestacaoContasDashboardBanner";
import { InicioResolvidosPanel } from "@/components/cooperado/InicioResolvidosPanel";
import { listarResolvidosInicioCooperado } from "@/services/cooperadoInicioResolvidosService";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { listPautasAbertasCooperado, resultadoVisivelCooperado } from "@/services/votacaoService";
import { VotacaoPautasInicioPanel } from "@/components/votacao/VotacaoPautasInicioPanel";
import { VotacaoResultadoPanel } from "@/components/votacao/VotacaoResultadoPanel";
import { getCooperativaCnpj, getPendingNotaDeleteIds } from "@/services/notaPedidoCloudService";
import { buildValorExibicaoCooperadoOpts } from "@/services/notaPedidoService";
import { useSyncContaCoopValorReceberPilot } from "@/hooks/useSyncContaCoopValorReceberPilot";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getUserCooperativaId, getUserCooperativaNome, normalizeCnpj } from "@/utils/cooperativa";
import { Camera, Wallet, ClipboardList, Users, Vote, Download } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cooperadoTemAppInstalado, isAppStandalone, resumoInstalacaoApp } from "@/services/cooperadoAppInstallService";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

function CooperadoDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { syncing, lastSyncError } = useSyncStatus();
  const recoverySyncRef = useRef(false);

  const financeiroAusente = useAppDataSelector((data) => {
    if (!data || !user?.cooperadoId) return false;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return false;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    return cooperadoFinanceiroDesatualizado(data, cooperadoId, coopId);
  }, [user?.id, user?.cooperadoId, user?.cooperativaId]);

  useEffect(() => {
    recoverySyncRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.cooperadoId || typeof navigator === "undefined" || !navigator.onLine) return;
    requestVotacaoOperacionalSync();
  }, [user?.id, user?.cooperadoId]);

  useEffect(() => {
    if (!financeiroAusente || recoverySyncRef.current || typeof navigator === "undefined" || !navigator.onLine) {
      return;
    }
    recoverySyncRef.current = true;
    requestAppSyncImmediate();
  }, [financeiroAusente]);

  const contaCoopSync = useAppDataSelector((data) => {
    if (!data || !user?.cooperadoId) return null;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return null;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    const exibicaoOpts = buildValorExibicaoCooperadoOpts(
      data,
      cooperadoId,
      getMesPrincipalQuantoVouReceber(data, cooperadoId, coopId),
      coopId
    );
    return {
      cooperadoId,
      mesReferencia: exibicaoOpts.mesReferencia,
      cooperativaId: coopId,
      cooperadoNome: exibicaoOpts.cooperadoNome,
    };
  }, [user?.id, user?.cooperadoId, user?.cooperativaId]);

  useSyncContaCoopValorReceberPilot(contaCoopSync ? { ...contaCoopSync, user } : undefined);

  const view = useAppDataSelector((data) => {
    if (!data || !user?.cooperadoId) return null;

    const coopId = getUserCooperativaId(user, data);
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    const mes = getCurrentMesReferencia();
    const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
    const coopNome = getUserCooperativaNome(user, data);
    const valorReceber = cooperadoExibirValorReceberInicio(data, cooperadoId, coopId);
    const precisaPix = cooperado ? cooperadoPrecisaCadastrarPix(cooperado.chavePix, cooperado.pixValido) : false;
    const notasPendentes = listarNotasPendentesCooperado(data, cooperadoId, coopId);
    const rejeitadas = notasPendentes.filter((n) => n.status === "rejeitada");
    const cnpj = coopId ? getCooperativaCnpj(data, coopId) : undefined;
    const pendingDeletes = cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
    const notasEmAnalise = notasPendentes.filter(
      (n) => n.status === "aguardando_conferencia" && !pendingDeletes.has(n.id)
    );
    const fotosEmAnalise = contarFotosEmAnaliseCooperado(notasEmAnalise);
    const resumoMens = getResumoMensalidadesCooperado(data, cooperadoId, coopId);
    const mensalidadeAberta = resumoMens.situacao === "atrasada";
    const prestacao = coopId ? prestacaoPrincipalCooperado(data, cooperadoId, coopId) : undefined;
    const prestacaoAberta = prestacao ? prestacaoExigeAtencaoCooperado(prestacao) : false;
    const avulsosPendentesTotal = totalValoresAvulsosPendentes(data, cooperadoId, undefined, coopId);
    const avulsosJaNoCardPrincipal =
      valorReceber.exibir &&
      (valorReceber.meses.length > 0
        ? valorReceber.meses.some((m) => totalValoresAvulsosPendentes(data, cooperadoId, m, coopId) > 0)
        : totalValoresAvulsosPendentes(data, cooperadoId, valorReceber.mes, coopId) > 0);
    const exibirCardAvulsosSeparado = avulsosPendentesTotal > 0 && !avulsosJaNoCardPrincipal;
    const comunicados = coopId ? getComunicadosInicioCooperado(data, coopId, cooperadoId) : [];
    const pautasAbertas = coopId ? listPautasAbertasCooperado(data, coopId, cooperadoId) : [];
    const resultadoVotacao = coopId ? resultadoVisivelCooperado(data, coopId) : null;
    const resolvidos = listarResolvidosInicioCooperado(data, cooperadoId, coopId);
    const temSecaoPendencias =
      rejeitadas.length > 0 ||
      fotosEmAnalise > 0 ||
      valorReceber.exibir ||
      precisaPix ||
      mensalidadeAberta ||
      prestacaoAberta ||
      exibirCardAvulsosSeparado;
    const mostrarBaixarApp =
      Boolean(cooperado) &&
      !cooperado!.avulso &&
      !isAppStandalone() &&
      !cooperadoTemAppInstalado(cooperado!);

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
    };
  }, [user?.id, user?.cooperadoId, user?.cooperativaId]);

  if (!view) return <PageSkeleton />;

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
  } = view;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {cooperado?.nomeCompleto.split(" ")[0]}!</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

      {financeiroAusente && (
        <AlertBanner
          variant={lastSyncError ? "error" : "info"}
          title={syncing ? "Sincronizando sua ficha…" : "Valores ainda não carregaram"}
        >
          {syncing
            ? "Baixando entregas e ficha da nuvem. Aguarde alguns segundos com internet."
            : lastSyncError
              ? `${lastSyncError} Toque em atualizar ou saia e entre de novo.`
              : "Toque em atualizar ou aguarde — seus lançamentos estão guardados na nuvem."}
          {!syncing && (
            <button
              type="button"
              className="ml-2 font-semibold underline"
              onClick={() => {
                recoverySyncRef.current = false;
                requestAppSyncImmediate();
              }}
            >
              Atualizar agora
            </button>
          )}
        </AlertBanner>
      )}

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

      <OnboardingChecklist pixOk={!precisaPix} />

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

      <div className={`grid grid-cols-1 gap-4 ${valorReceber.exibir ? "sm:grid-cols-2" : ""}`}>
        {valorReceber.exibir && (
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-6 shadow-sm">
            <Wallet size={28} className="mb-3 opacity-90" />
            <p className="text-amber-100 text-sm">
              {valorReceber.aguardandoAssinatura ? "Confirme o recebimento" : "A receber"} · {valorReceber.mesLabel}
            </p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(valorReceber.valor)}</p>
            <Link href="/ficha-corrida" className="inline-block mt-4 text-sm font-medium bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg">
              {valorReceber.aguardandoAssinatura ? "Assinar recibo" : "Ver detalhes"}
            </Link>
          </div>
        )}

        <div className={`bg-white border-2 border-green-200 rounded-2xl p-6 flex flex-col justify-between ${!valorReceber.exibir ? "sm:max-w-md" : ""}`}>
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

      <InicioResolvidosPanel itens={resolvidos} />
    </div>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const { check } = usePermissions();
  const creditFlag = useHbCreditEnabled();

  const view = useAppDataSelector((data) => {
    if (!data || !user) return null;
    const coopId = getUserCooperativaId(user, data);
    const stats = getAdminStats(data);
    const coopNome = getUserCooperativaNome(user, data);
    const mes = getCurrentMesReferencia();
    const fila = getFilaDoDia(data, coopId, mes);
    const instalacao = coopId ? resumoInstalacaoApp(data, coopId) : null;
    let cnpj = "";
    if (user.cooperativaCnpj) cnpj = normalizeCnpj(user.cooperativaCnpj);
    else {
      const coop = data.cooperativas.find((c) => c.id === coopId);
      if (coop?.cnpj) cnpj = normalizeCnpj(coop.cnpj);
    }
    return { stats, coopNome, fila, mes, instalacao, cnpj };
  }, [user?.id, user?.cooperativaId, user?.role]);

  if (!view) return <PageSkeleton />;

  const { stats, coopNome, fila, mes, instalacao, cnpj } = view;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel da cooperativa</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

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

      <FilaDoDiaPanel items={fila} />

      {creditFlag.enabled && cnpj.length === 14 && <ContaCoopFilaCloudPanel cnpj={cnpj} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="A pagar aos cooperados" value={formatCurrency(stats.valoresAPagar)} icon={<Wallet size={24} />} variant="warning" />
        <StatCard title="Entregas p/ conferir" value={String(stats.entregasPendentes)} icon={<ClipboardList size={24} />} variant="gold" />
        <StatCard title="Cooperados ativos" value={String(stats.cooperadosAtivos)} icon={<Users size={24} />} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, accountUser } = useAuth();
  if (!user) return null;

  const authSubject = accountUser ?? user;
  const canGestao = canAccessPainelResponsavel(authSubject, getData());

  if (isCooperadoAppUser(user) || !canGestao) {
    return <CooperadoDashboard />;
  }

  if (isDiretoriaRole(user.role)) {
    return <AdminDashboard />;
  }

  return <CooperadoDashboard />;
}
