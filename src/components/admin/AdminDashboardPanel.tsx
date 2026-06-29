"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Lock,
  TrendingUp,
  Wallet,
  ClipboardList,
  Users,
  Building2,
  AlertTriangle,
  Activity,
  BarChart3,
  FileText,
  CreditCard,
  PieChart,
  LogOut,
  Settings,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppData } from "@/hooks/useAppData";
import { formatCurrency, formatMesReferencia, formatDate } from "@/utils/format";
import { formatCnpj, getCooperativaById } from "@/utils/cooperativa";
import {
  getAdminAreaSnapshot,
  lockAdminArea,
  refreshAdminAreaSession,
  removerSenhaAreaAdmin,
} from "@/services/adminAreaService";
import { updateData } from "@/services/dataStore";
import type { Cooperativa, User } from "@/types";

type AdminUser = Pick<User, "id" | "name">;

interface AdminDashboardPanelProps {
  cooperativaId: string;
  user: AdminUser;
  onLocked: () => void;
}

const QUICK_LINKS = [
  { href: "/notas-pedido", label: "Conferir entregas", icon: ClipboardList, desc: "Fotos e lançamentos" },
  { href: "/ficha-corrida", label: "Pagar cooperados", icon: Wallet, desc: "PIX e recibos" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, desc: "Exportações e fechamento" },
  { href: "/mensalidades", label: "Mensalidades", icon: CreditCard, desc: "Cobranças e inadimplência" },
  { href: "/cotas", label: "Cotas", icon: PieChart, desc: "Parcelas e quitações" },
  { href: "/cooperados", label: "Cooperados", icon: Users, desc: "Cadastro e equipe" },
  { href: "/contratos", label: "Contratos", icon: Building2, desc: "Instituições e preços" },
  { href: "/fechamento-mensal", label: "Fechamento", icon: FileText, desc: "Consolidação mensal" },
];

export function AdminDashboardPanel({ cooperativaId, user, onLocked }: AdminDashboardPanelProps) {
  const data = useAppData();
  const [showSenhaPanel, setShowSenhaPanel] = useState(false);
  const [senhaAtualRemover, setSenhaAtualRemover] = useState("");
  const [msgSenha, setMsgSenha] = useState<string | null>(null);

  const cooperativa = data ? getCooperativaById(data, cooperativaId) : undefined;

  const snapshot = useMemo(
    () => (data ? getAdminAreaSnapshot(data, cooperativaId) : null),
    [data, cooperativaId]
  );

  if (!data || !snapshot || !cooperativa) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        Carregando dados da cooperativa…
      </div>
    );
  }

  const { stats, resumoFinanceiro, alertas, entregasAguardando, pagamentosPendentes, auditRecente } =
    snapshot;
  const mes = snapshot.mesReferencia;
  const resumo = resumoFinanceiro.resumo;

  const handleLock = () => {
    lockAdminArea(cooperativaId);
    onLocked();
  };

  const handleRefreshSession = () => {
    refreshAdminAreaSession(cooperativaId);
  };

  const handleRemoverSenha = async () => {
    setMsgSenha(null);
    const result = await removerSenhaAreaAdmin(updateData, cooperativaId, user, senhaAtualRemover);
    if (!result.success) {
      setMsgSenha(result.error ?? "Erro ao remover senha.");
      return;
    }
    setSenhaAtualRemover("");
    setShowSenhaPanel(false);
    onLocked();
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header executivo */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-slate-300 text-sm mb-2">
              <Shield size={16} />
              <span>Painel executivo · área protegida</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{cooperativa.nome}</h1>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
              <span>CNPJ {formatCnpj(cooperativa.cnpj)}</span>
              {cooperativa.responsavel && <span>Responsável: {cooperativa.responsavel}</span>}
              <span>{formatMesReferencia(mes)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={handleRefreshSession}
            >
              <Clock size={16} /> Renovar sessão
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={() => setShowSenhaPanel((v) => !v)}
            >
              <Settings size={16} /> Senha
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-red-500/20 border-red-400/30 text-white hover:bg-red-500/30"
              onClick={handleLock}
            >
              <LogOut size={16} /> Bloquear
            </Button>
          </div>
        </div>
      </div>

      {showSenhaPanel && (
        <Card title="Gerenciar senha da área admin" className="border-amber-200 bg-amber-50/30">
          <p className="text-sm text-gray-600 mb-4">
            Para alterar a senha, saia do painel e use a opção &quot;Cadastrar ou alterar senha&quot; na tela de
            login. Aqui você pode remover a proteção (exige senha atual).
          </p>
          {msgSenha && (
            <AlertBanner variant="error" title="Erro" className="mb-4">
              {msgSenha}
            </AlertBanner>
          )}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-gray-600 block mb-1">Senha atual</label>
              <input
                type="password"
                value={senhaAtualRemover}
                onChange={(e) => setSenhaAtualRemover(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button variant="danger" onClick={() => void handleRemoverSenha()} disabled={!senhaAtualRemover}>
              <Lock size={16} /> Remover proteção
            </Button>
          </div>
        </Card>
      )}

      {/* Alertas operacionais */}
      {alertas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertTriangle size={16} /> Alertas operacionais
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertas.map((a) => (
              <Link
                key={a.id}
                href={a.href ?? "#"}
                className={`block rounded-xl border p-4 transition-all hover:shadow-md ${
                  a.severity === "critical"
                    ? "border-red-200 bg-red-50 hover:border-red-300"
                    : a.severity === "warning"
                      ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                      : "border-blue-200 bg-blue-50 hover:border-blue-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{a.title}</p>
                    <p className="text-sm text-gray-600 mt-1">{a.description}</p>
                  </div>
                  {a.count != null && (
                    <span className="text-2xl font-bold text-gray-800 tabular-nums">{a.count}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* KPIs principais */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          <TrendingUp size={16} /> Indicadores do mês
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Vendas do mês"
            value={formatCurrency(stats.totalVendidoMes)}
            subtitle={`Ano: ${formatCurrency(stats.totalVendidoAno)}`}
            icon={<TrendingUp size={24} />}
            variant="success"
          />
          <StatCard
            title="A pagar cooperados"
            value={formatCurrency(stats.valoresAPagar)}
            subtitle={`${stats.pagamentosPendentes} lançamento(s) pendente(s)`}
            icon={<Wallet size={24} />}
            variant="warning"
          />
          <StatCard
            title="Já pago no mês"
            value={formatCurrency(stats.valoresPagos)}
            icon={<CreditCard size={24} />}
          />
          <StatCard
            title="Saldo cooperativa"
            value={formatCurrency(stats.saldoCooperativa)}
            subtitle="Posição financeira do mês"
            icon={<BarChart3 size={24} />}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
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
          <StatCard
            title="Débitos em aberto"
            value={formatCurrency(stats.debitosAbertos)}
            subtitle="Mensalidades + cotas"
            icon={<AlertTriangle size={24} />}
            variant={stats.debitosAbertos > 0 ? "danger" : "default"}
          />
          <StatCard
            title="Instituições"
            value={String(snapshot.instituicoesAtivas)}
            subtitle="Contratos ativos"
            icon={<Building2 size={24} />}
          />
        </div>
      </section>

      {/* Resumo financeiro detalhado */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Resumo financeiro · mês atual">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Total vendas (bruto)</dt>
              <dd className="font-semibold text-gray-900">{formatCurrency(resumo.totalVendasBruto)}</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Total vendas (líquido)</dt>
              <dd className="font-semibold text-gray-900">{formatCurrency(resumo.totalVendasLiquido)}</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Mensalidades recebidas</dt>
              <dd className="font-semibold text-green-700">{formatCurrency(stats.mensalidadesRecebidas)}</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Cotas recebidas</dt>
              <dd className="font-semibold text-green-700">{formatCurrency(stats.cotasRecebidas)}</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Pagamentos pendentes</dt>
              <dd className="font-semibold text-amber-700">{formatCurrency(resumo.pagamentosPendentes)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Entregas conferidas no mês</dt>
              <dd className="font-semibold text-gray-900">{resumo.totalEntregas}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Acesso rápido">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-200">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm truncate">{link.label}</p>
                    <p className="text-xs text-gray-500 truncate">{link.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                </Link>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Filas operacionais */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Fila de conferência"
          action={
            entregasAguardando.length > 0 ? (
              <Link href="/notas-pedido" className="text-xs font-medium text-green-700 hover:underline">
                Ver todas
              </Link>
            ) : undefined
          }
        >
          {entregasAguardando.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Nenhuma entrega aguardando conferência.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {entregasAguardando.map((e) => (
                <li key={e.id} className="py-3 flex justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{e.cooperadoNome}</p>
                    <p className="text-gray-500">{e.instituicao}</p>
                  </div>
                  <span className="text-gray-400 shrink-0">{formatDate(e.dataEntrega)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Cooperados a pagar"
          action={
            pagamentosPendentes.length > 0 ? (
              <Link href="/ficha-corrida" className="text-xs font-medium text-green-700 hover:underline">
                Ir para pagamentos
              </Link>
            ) : undefined
          }
        >
          {pagamentosPendentes.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Nenhum valor pendente neste mês.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pagamentosPendentes.map((p, i) => (
                <li key={`${p.cooperadoNome}-${i}`} className="py-3 flex justify-between gap-3 text-sm">
                  <p className="font-medium text-gray-900">{p.cooperadoNome}</p>
                  <span className="font-semibold text-amber-700 tabular-nums">{formatCurrency(p.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Auditoria recente */}
      <Card title="Atividade recente" action={<Activity size={18} className="text-gray-400" />}>
        {auditRecente.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhum registro recente.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {auditRecente.map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-gray-900">{entry.userName}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {formatDate(entry.timestamp.split("T")[0])}
                  </span>
                </div>
                <p className="text-gray-600 mt-0.5">{entry.changes ?? entry.action}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CooperativaInfoFooter cooperativa={cooperativa} />
    </div>
  );
}

function CooperativaInfoFooter({ cooperativa }: { cooperativa: Cooperativa }) {
  return (
    <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
      <p>
        {cooperativa.email && <span>{cooperativa.email} · </span>}
        {cooperativa.telefone && <span>{cooperativa.telefone} · </span>}
        Status: {cooperativa.status === "ativa" ? "Ativa" : "Inativa"}
      </p>
      <p className="mt-1">Dados consolidados localmente · sessão admin expira em 2 horas de inatividade</p>
    </div>
  );
}
