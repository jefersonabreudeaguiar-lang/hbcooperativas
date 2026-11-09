"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Wallet, Banknote, Smartphone, ArrowRight, AlertTriangle } from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppData } from "@/hooks/useAppData";
import { formatCurrency, formatDateTime, getCurrentMesReferencia } from "@/utils/format";
import { secureApiFetch } from "@/lib/security/clientSession";
import { usePlatformBillingOverview } from "@/hooks/usePlatformBillingOverview";
import {
  buildLevantamentoFromAppData,
  mergeLevantamentoComDadosLocais,
  type LevantamentoAberturasApp,
} from "@/services/cooperadoAppUsageService";
import {
  formatCentsAdmin,
  type ContaCoopPlatformOverview,
} from "@/services/platformContaCoopAdminService";
import { buildPlatformAdminSnapshot, type CloudPlatformOverview } from "@/services/platformAdminService";
import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";
import type { AdminSection } from "@/components/admin/AdminNav";

interface AdminInicioPanelProps {
  onNavigate: (section: AdminSection) => void;
}

export function AdminInicioPanel({ onNavigate }: AdminInicioPanelProps) {
  const data = useAppData();
  const billing = usePlatformBillingOverview();
  const [cloud, setCloud] = useState<CloudPlatformOverview | null>(null);
  const [appUsage, setAppUsage] = useState<LevantamentoAberturasApp | null>(null);
  const [contaCoop, setContaCoop] = useState<ContaCoopPlatformOverview | null>(null);
  const [creditError, setCreditError] = useState(false);

  useEffect(() => {
    let active = true, busy = false;
    const refresh = async () => {
      if (!active || busy || document.hidden) return;
      busy = true;
      try {
        const r = await secureApiFetch(`/api/admin/conta-coop-overview?allPending=1&mes=${getCurrentMesReferencia()}`, { cache: 'no-store' });
        const json = await r.json();
        if (!r.ok || !json.ok || !json.overview) throw Error('Nuvem indisponível');
        if (active) { setContaCoop(json.overview); setCreditError(false); }
      } catch { if (active) setCreditError(true); }
      finally { busy = false; }
    };
    const tick = () => { void refresh(); };
    tick();
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);

  useEffect(() => {
    void secureApiFetch("/api/admin/platform-overview", { cache: "no-store" })
      .then((r) => r.json())
      .then(setCloud)
      .catch(() => setCloud(null));
    void secureApiFetch("/api/admin/app-usage", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { levantamento?: LevantamentoAberturasApp }) => setAppUsage(json.levantamento ?? null))
      .catch(() => setAppUsage(null));
  }, []);

  const snapshot = useMemo(
    () => (data ? buildPlatformAdminSnapshot(data, cloud) : null),
    [data, cloud]
  );

  const levantamento = useMemo(() => {
    if (!data) return null;
    return mergeLevantamentoComDadosLocais(appUsage ?? buildLevantamentoFromAppData(data), data);
  }, [appUsage, data]);

  const cobranca = useMemo(() => {
    if (!billing.overview) return null;
    const rows = billing.overview.rows;
    const aReceber = rows
      .filter((r) =>
        ["cobranca_enviada", "aguardando_confirmacao", "aviso_bloqueio", "bloqueado"].includes(r.statusMes)
      )
      .reduce((s, r) => s + r.totalEmAberto, 0);
    return {
      pendentes: rows.filter((r) => r.aguardandoConfirmacao).length,
      aReceber,
    };
  }, [billing.overview]);

  if (!data || !snapshot) {
    return <p className="text-sm text-gray-500 py-12 text-center">Carregando painel…</p>;
  }

  const alerts: Array<{ title: string; text: string; action: AdminSection; tone: "warning" | "info" }> = [];
  if (cobranca && cobranca.pendentes > 0) {
    alerts.push({
      title: "Pagamentos aguardando confirmação",
      text: `${cobranca.pendentes} cooperativa(s) informaram pagamento da mensalidade HB.`,
      action: "cobranca",
      tone: "warning",
    });
  }
  if (contaCoop && contaCoop.totais.appRepassePendenteCents > 0) {
    alerts.push({
      title: "Repasse HB Créditos pendente",
      text: `${formatCentsAdmin(contaCoop.totais.appRepassePendenteCents)} aguardando PIX das cooperativas.`,
      action: "conta-coop",
      tone: "warning",
    });
  }
  if (snapshot.storage.status !== "ok") {
    alerts.push({
      title: "Armazenamento local elevado",
      text: snapshot.storage.statusLabel,
      action: "sistema",
      tone: "info",
    });
  }

  return (
    <div className="space-y-6 pb-8">
      <AdminSectionHeader
        title="Início"
        description="Resumo executivo da plataforma HB — pendências, receitas e engajamento em um só lugar."
        updatedAt={formatDateTime(snapshot.geradoEm)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Cooperativas"
          value={String(snapshot.totais.cooperativas)}
          subtitle={`${snapshot.totais.cooperativasAtivas} ativa(s)`}
          icon={<Building2 size={22} />}
          variant="success"
        />
        <StatCard
          title="Cobrança em aberto"
          value={cobranca ? formatCurrency(cobranca.aReceber) : billing.error ? "Indisponível" : "Conferindo…"}
          subtitle={
            cobranca?.pendentes
              ? `${cobranca.pendentes} aguardando confirmação`
              : "Mensalidade HB"
          }
          icon={<Banknote size={22} />}
          variant="gold"
        />
        <StatCard
          title="HB Créditos · HB"
          value={creditError ? 'Indisponível' : contaCoop ? formatCentsAdmin(contaCoop.totais.appRepassePendenteCents) : "Conferindo…"}
          subtitle="Parte do desconto liquidada e ainda não repassada · todos os meses"
          icon={<Wallet size={22} />}
        />
        <StatCard
          title="Uso do app"
          value={String(levantamento?.mediaAberturasPorCooperado ?? 0).replace(".", ",")}
          subtitle="média de aberturas/cooperado"
          icon={<Smartphone size={22} />}
        />
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertBanner key={alert.title} variant={alert.tone} title={alert.title}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span>{alert.text}</span>
                <Button size="sm" variant="secondary" onClick={() => onNavigate(alert.action)}>
                  Ver detalhes <ArrowRight size={14} />
                </Button>
              </div>
            </AlertBanner>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Acesso rápido" className="lg:col-span-1">
          <div className="space-y-2">
            {(
              [
                ["cobranca", "Cobrança mensal HB", Banknote],
                ["conta-coop", "Operação HB Créditos", Wallet],
                ["cooperativas", "Cooperativas e engajamento", Building2],
                ["sistema", "Nuvem e configurações", AlertTriangle],
              ] as const
            ).map(([section, label, Icon]) => (
              <button
                key={section}
                type="button"
                onClick={() => onNavigate(section)}
                className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} className="text-emerald-700" />
                  {label}
                </span>
                <ArrowRight size={16} className="text-gray-400" />
              </button>
            ))}
          </div>
        </Card>

        <Card title="Indicadores do mês" className="lg:col-span-2">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-gray-500">Cooperados ativos</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-900">{snapshot.totais.cooperadosAtivos}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-gray-500">Entregas registradas</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-900">{snapshot.totais.entregas}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-gray-500">Compras HB Créditos</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-900">{contaCoop?.totais.transacoes ?? 0}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-gray-500">Cooperados usando o app</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-900">
                {levantamento?.cooperadosComAbertura ?? 0}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
