"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isAdminRole } from "@/permissions";
import { StatCard } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { OnboardingChecklist } from "@/components/cooperado/OnboardingChecklist";
import { getCooperadoStats, getAdminStats } from "@/services/dashboardService";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import { syncNotasPedidoFromCloud, getCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { getComunicadosCooperado } from "@/services/comunicadoService";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getUserCooperativaId, getUserCooperativaNome } from "@/utils/cooperativa";
import { Camera, Wallet, ClipboardList, Megaphone, Pin, Users, AlertCircle, Tag } from "lucide-react";

function CooperadoDashboard() {
  const { user } = useAuth();
  const data = useAppData();
  const router = useRouter();
  if (!data || !user?.cooperadoId) return null;

  const mes = getCurrentMesReferencia();
  const cooperado = data.cooperados.find((c) => c.id === user.cooperadoId);
  const coopNome = getUserCooperativaNome(user, data);
  const valorMesFicha = getTotalAPagarCooperado(data, user.cooperadoId, mes);
  const precisaPix = cooperado ? cooperadoPrecisaCadastrarPix(cooperado.chavePix, cooperado.pixValido) : false;
  const entregasMes = data.notasPedido.filter((n) => n.cooperadoId === user.cooperadoId && n.mesReferencia === mes);
  const rejeitadas = data.notasPedido.filter((n) => n.cooperadoId === user.cooperadoId && n.status === "rejeitada");
  const emAnalise = entregasMes.filter((n) => n.status === "aguardando_conferencia").length;
  const coopId = getUserCooperativaId(user, data);
  const comunicados = coopId ? getComunicadosCooperado(data, coopId, user.cooperadoId).slice(0, 3) : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {cooperado?.nomeCompleto.split(" ")[0]}!</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

      <OnboardingChecklist pixOk={!precisaPix} />

      {rejeitadas.length > 0 && (
        <AlertBanner variant="error" title="Entrega precisa de correção">
          Você tem {rejeitadas.length} entrega(s) que a cooperativa pediu para corrigir.{" "}
          <Link href="/notas-pedido" className="font-semibold underline">Ver e enviar de novo</Link>
        </AlertBanner>
      )}

      {emAnalise > 0 && (
        <AlertBanner variant="info" title="Entregas em análise">
          {emAnalise} foto(s) aguardando conferência da cooperativa. Você será avisado quando o valor for lançado.
        </AlertBanner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-6 shadow-sm">
          <Wallet size={28} className="mb-3 opacity-90" />
          <p className="text-amber-100 text-sm">A receber este mês</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(valorMesFicha)}</p>
          <Link href="/ficha-corrida" className="inline-block mt-4 text-sm font-medium bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg">
            Ver detalhes
          </Link>
        </div>

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

      <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Tag size={24} className="text-green-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900">Preços dos itens</p>
            <p className="text-sm text-gray-500 mt-0.5">Veja quanto vale cada produto por escola.</p>
          </div>
        </div>
        <Link href="/precos">
          <Button variant="secondary">Consultar</Button>
        </Link>
      </div>

      {precisaPix && (
        <AlertBanner variant="warning" title="Cadastre onde quer receber">
          {cooperado?.pixInvalidoMotivo ?? "Informe sua chave PIX (CPF, celular ou e-mail) para receber o pagamento."}
          <Link href="/meu-cadastro">
            <Button size="sm" className="mt-3">Cadastrar PIX</Button>
          </Link>
        </AlertBanner>
      )}

      {comunicados.length > 0 && (
        <Card title="Avisos da cooperativa">
          <div className="space-y-3">
            {comunicados.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100">
                {c.fixado ? <Pin size={16} className="text-amber-500 mt-0.5 shrink-0" /> : <Megaphone size={16} className="text-green-600 mt-0.5 shrink-0" />}
                <div>
                  <p className="font-medium text-sm text-gray-900">{c.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(c.data)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AdminDashboard() {
  const data = useAppData();
  const { user } = useAuth();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  useEffect(() => {
    if (!data || !coopId) return;
    const cnpj = getCooperativaCnpj(data, coopId);
    if (!cnpj) return;
    void syncNotasPedidoFromCloud(cnpj);
    const id = setInterval(() => {
      void syncNotasPedidoFromCloud(cnpj);
    }, 15000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coopId]);

  if (!data || !user) return null;

  const stats = getAdminStats(data);
  const coopNome = getUserCooperativaNome(user, data);
  const pendentes = data.notasPedido.filter(
    (n) => n.status === "aguardando_conferencia" && notaPertenceCooperativa(data, n, coopId)
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel da cooperativa</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(getCurrentMesReferencia())}</p>
      </div>

      {pendentes > 0 && (
        <AlertBanner variant="warning" title={`${pendentes} entrega(s) para conferir`}>
          Fotos enviadas pelos cooperados aguardando análise.
          <Link href="/notas-pedido">
            <Button size="sm" className="mt-3"><ClipboardList size={16} /> Conferir agora</Button>
          </Link>
        </AlertBanner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="A pagar aos cooperados" value={formatCurrency(stats.valoresAPagar)} icon={<Wallet size={24} />} variant="warning" />
        <StatCard title="Já pagos" value={formatCurrency(stats.valoresPagos)} icon={<Wallet size={24} />} variant="success" />
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

  if (isAdminRole(user.role) || user.role === "presidente") {
    return <AdminDashboard />;
  }

  return <CooperadoDashboard />;
}
