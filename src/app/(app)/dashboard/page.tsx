"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDataSelector } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isDiretoriaRole } from "@/permissions";
import { StatCard } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { OnboardingChecklist } from "@/components/cooperado/OnboardingChecklist";
import { CooperadoMensalidadesPagarPanel } from "@/components/cooperado/CooperadoMensalidadesPagarPanel";
import { ValoresAvulsosDashboardCard } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { getAdminStats } from "@/services/dashboardService";
import { cooperadoExibirValorReceberInicio,
  listarNotasPendentesCooperado,
} from "@/services/cooperadoEntregasService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { notaPertenceCooperativa, contarFotosEnviadasNotas } from "@/utils/fotoEntrega";
import { getComunicadosInicioCooperado } from "@/services/comunicadoService";
import { getResumoMensalidadesCooperado } from "@/services/mensalidadeService";
import { prestacaoPrincipalCooperado, prestacaoExigeAtencaoCooperado } from "@/services/prestacaoContasService";
import { totalValoresAvulsosPendentes } from "@/services/valoresAvulsosReceberService";
import { AvisosInicioSection } from "@/components/comunicado/AvisosInicioSection";
import { PrestacaoContasDashboardBanner } from "@/components/prestacao/PrestacaoContasDashboardBanner";
import { InicioResolvidosPanel } from "@/components/cooperado/InicioResolvidosPanel";
import { listarResolvidosInicioCooperado } from "@/services/cooperadoInicioResolvidosService";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getUserCooperativaId, getUserCooperativaNome } from "@/utils/cooperativa";
import { Camera, Wallet, ClipboardList, Users, AlertCircle } from "lucide-react";
import { requestAppSync } from "@/services/syncRequest";

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 bg-gray-200 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-28 bg-white rounded-xl border border-gray-200" />
        <div className="h-28 bg-white rounded-xl border border-gray-200" />
      </div>
      <div className="h-36 bg-white rounded-xl border border-gray-200" />
    </div>
  );
}

function CooperadoDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    requestAppSync();
  }, []);

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
    const notasEmAnalise = notasPendentes.filter((n) => n.status === "aguardando_conferencia");
    const fotosEmAnalise = contarFotosEnviadasNotas(notasEmAnalise);
    const resumoMens = getResumoMensalidadesCooperado(data, cooperadoId, coopId);
    const mensalidadeAberta = resumoMens.situacao === "atrasada";
    const prestacao = coopId ? prestacaoPrincipalCooperado(data, cooperadoId, coopId) : undefined;
    const prestacaoAberta = prestacao ? prestacaoExigeAtencaoCooperado(prestacao) : false;
    const avulsosPendentesTotal = totalValoresAvulsosPendentes(data, cooperadoId, undefined, coopId);
    const avulsosJaNoCardPrincipal =
      valorReceber.exibir &&
      totalValoresAvulsosPendentes(data, cooperadoId, valorReceber.mes, coopId) > 0;
    const exibirCardAvulsosSeparado = avulsosPendentesTotal > 0 && !avulsosJaNoCardPrincipal;
    const comunicados = coopId ? getComunicadosInicioCooperado(data, coopId, cooperadoId) : [];
    const resolvidos = listarResolvidosInicioCooperado(data, cooperadoId, coopId);
    const temSecaoPendencias =
      rejeitadas.length > 0 ||
      fotosEmAnalise > 0 ||
      valorReceber.exibir ||
      precisaPix ||
      mensalidadeAberta ||
      prestacaoAberta ||
      exibirCardAvulsosSeparado;

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
      resolvidos,
      temSecaoPendencias,
      coopId,
    };
  }, [user?.id, user?.cooperadoId, user?.cooperativaId]);

  if (!view) return <DashboardSkeleton />;

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
    resolvidos,
    temSecaoPendencias,
    coopId: viewCoopId,
  } = view;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {cooperado?.nomeCompleto.split(" ")[0]}!</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

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
              {valorReceber.aguardandoAssinatura ? "Confirme o recebimento" : "A receber"} · {formatMesReferencia(valorReceber.mes)}
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

  const view = useAppDataSelector((data) => {
    if (!data || !user) return null;
    const coopId = getUserCooperativaId(user, data);
    const stats = getAdminStats(data);
    const coopNome = getUserCooperativaNome(user, data);
    const pendentes = data.notasPedido.filter(
      (n) => n.status === "aguardando_conferencia" && notaPertenceCooperativa(data, n, coopId)
    ).length;
    return { stats, coopNome, pendentes, mes: getCurrentMesReferencia() };
  }, [user?.id, user?.cooperativaId, user?.role]);

  if (!view) return <DashboardSkeleton />;

  const { stats, coopNome, pendentes, mes } = view;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel da cooperativa</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

      {pendentes > 0 && (
        <AlertBanner variant="warning" title={`${pendentes} entrega(s) para conferir`}>
          Fotos enviadas pelos cooperados aguardando análise.
          <Link href="/notas-pedido">
            <Button size="sm" className="mt-3"><ClipboardList size={16} /> Conferir agora</Button>
          </Link>
        </AlertBanner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="A pagar aos cooperados" value={formatCurrency(stats.valoresAPagar)} icon={<Wallet size={24} />} variant="warning" />
        <StatCard title="Entregas p/ conferir" value={String(stats.entregasPendentes)} icon={<ClipboardList size={24} />} variant="gold" />
        <StatCard title="Cooperados ativos" value={String(stats.cooperadosAtivos)} icon={<Users size={24} />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/notas-pedido" className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-green-400 hover:shadow-sm transition-all">
          <ClipboardList className="text-green-700 mb-2" size={24} />
          <p className="font-semibold text-gray-900">Conferir entregas</p>
          <p className="text-sm text-gray-500 mt-1">Ver fotos e lançar produtos</p>
        </Link>
        <Link href="/ficha-corrida" className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-green-400 hover:shadow-sm transition-all">
          <Wallet className="text-green-700 mb-2" size={24} />
          <p className="font-semibold text-gray-900">Pagar cooperados</p>
          <p className="text-sm text-gray-500 mt-1">Gerar PIX e registrar pagamento</p>
        </Link>
        <Link href="/contratos" className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-green-400 hover:shadow-sm transition-all">
          <AlertCircle className="text-green-700 mb-2" size={24} />
          <p className="font-semibold text-gray-900">Contratos</p>
          <p className="text-sm text-gray-500 mt-1">Instituições, itens e preços</p>
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  if (isDiretoriaRole(user.role)) {
    return <AdminDashboard />;
  }

  return <CooperadoDashboard />;
}
