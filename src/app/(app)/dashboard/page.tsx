"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isDiretoriaRole } from "@/permissions";
import { StatCard } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { OnboardingChecklist } from "@/components/cooperado/OnboardingChecklist";
import { MensalidadeStatusBanner } from "@/components/cooperado/MensalidadeStatusBanner";
import { ValoresAvulsosDashboardCard } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { getAdminStats } from "@/services/dashboardService";
import {
  cooperadoTemValorPendente,
  getValorQuantoVouReceber,
} from "@/services/cooperadoEntregasService";
import { notaPertenceCooperado } from "@/services/cooperadoCloudService";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { getComunicadosCooperado } from "@/services/comunicadoService";
import { MuralComunicados } from "@/components/comunicado/MuralComunicados";
import { PrestacaoContasDashboardBanner } from "@/components/prestacao/PrestacaoContasDashboardBanner";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getUserCooperativaId, getUserCooperativaNome } from "@/utils/cooperativa";
import { Camera, Wallet, ClipboardList, Users, AlertCircle } from "lucide-react";

function CooperadoDashboard() {
  const { user } = useAuth();
  const data = useAppData();
  const router = useRouter();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  if (!data || !user?.cooperadoId) return null;

  const cooperadoId = user.cooperadoId;
  const mes = getCurrentMesReferencia();
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const coopNome = getUserCooperativaNome(user, data);
  const temPendencia = cooperadoTemValorPendente(data, cooperadoId, coopId);
  const { mes: mesPendente, valor: valorPendente, aguardandoAssinatura } = getValorQuantoVouReceber(
    data,
    cooperadoId,
    coopId
  );
  const precisaPix = cooperado ? cooperadoPrecisaCadastrarPix(cooperado.chavePix, cooperado.pixValido) : false;
  const entregasMes = data.notasPedido.filter(
    (n) => notaPertenceCooperado(data, n, cooperadoId, coopId) && n.mesReferencia === mes
  );
  const rejeitadas = data.notasPedido.filter(
    (n) => notaPertenceCooperado(data, n, cooperadoId, coopId) && n.status === "rejeitada"
  );
  const emAnalise = entregasMes.filter((n) => n.status === "aguardando_conferencia").length;
  const comunicados = coopId ? getComunicadosCooperado(data, coopId, cooperadoId) : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {cooperado?.nomeCompleto.split(" ")[0]}!</h1>
        <p className="text-sm text-gray-500 mt-1">{coopNome} · {formatMesReferencia(mes)}</p>
      </div>

      <MuralComunicados comunicados={comunicados} limite={5} />

      <PrestacaoContasDashboardBanner cooperadoId={cooperadoId} cooperativaId={coopId} />

      <MensalidadeStatusBanner cooperadoId={cooperadoId} />

      <ValoresAvulsosDashboardCard cooperadoId={cooperadoId} cooperativaId={coopId} />

      <OnboardingChecklist pixOk={!precisaPix} />

      {(rejeitadas.length > 0 || emAnalise > 0 || temPendencia || precisaPix) && (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pendências</p>
      )}

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

      <div className={`grid grid-cols-1 gap-4 ${temPendencia ? "sm:grid-cols-2" : ""}`}>
        {temPendencia && (
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-6 shadow-sm">
            <Wallet size={28} className="mb-3 opacity-90" />
            <p className="text-amber-100 text-sm">
              {aguardandoAssinatura ? "Confirme o recebimento" : "A receber"} · {formatMesReferencia(mesPendente)}
            </p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(valorPendente)}</p>
            <Link href="/ficha-corrida" className="inline-block mt-4 text-sm font-medium bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg">
              {aguardandoAssinatura ? "Assinar recibo" : "Ver detalhes"}
            </Link>
          </div>
        )}

        <div className={`bg-white border-2 border-green-200 rounded-2xl p-6 flex flex-col justify-between ${!temPendencia ? "sm:max-w-md" : ""}`}>
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
    </div>
  );
}

function AdminDashboard() {
  const data = useAppData();
  const { user } = useAuth();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

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
