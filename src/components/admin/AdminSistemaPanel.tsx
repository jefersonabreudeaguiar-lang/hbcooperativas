"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Lock,
  Cloud,
  CloudOff,
  Activity,
  Database,
  HardDrive,
  Server,
  Settings,
  Gauge,
  RefreshCw,
  Banknote,
  Copy,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Input, FormField } from "@/components/ui/Form";
import { useAppData } from "@/hooks/useAppData";
import { formatDateTime } from "@/utils/format";
import { alterarSenhaLoginAdmin } from "@/services/adminAreaService";
import {
  buildPlatformAdminSnapshot,
  formatBytes,
  type CloudPlatformOverview,
} from "@/services/platformAdminService";
import {
  capacityStatusClass,
  capacityStatusLabel,
  type PlatformCapacitySnapshot,
} from "@/services/platformCapacityService";
import { secureApiFetch } from "@/lib/security/clientSession";
import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";
import type { User } from "@/types";

type AdminUser = Pick<User, "id" | "name">;

interface AdminSistemaPanelProps {
  user: AdminUser;
}

export function AdminSistemaPanel({ user }: AdminSistemaPanelProps) {
  const data = useAppData();
  const [cloud, setCloud] = useState<CloudPlatformOverview | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [capacity, setCapacity] = useState<PlatformCapacitySnapshot | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(true);
  const [asaasSetup, setAsaasSetup] = useState<{
    configured: boolean;
    sandbox: boolean;
    webhookUrl: string;
    webhookTokenConfigured: boolean;
  } | null>(null);
  const [asaasLoading, setAsaasLoading] = useState(true);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState<{ type: "ok" | "erro"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCloudLoading(true);
    secureApiFetch("/api/admin/platform-overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: CloudPlatformOverview) => {
        if (!cancelled) setCloud(json);
      })
      .catch(() => {
        if (!cancelled) setCloud(null);
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadCapacity = () => {
    setCapacityLoading(true);
    secureApiFetch("/api/admin/platform-capacity", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok?: boolean; snapshot?: PlatformCapacitySnapshot }) => {
        if (json.ok && json.snapshot) setCapacity(json.snapshot);
        else setCapacity(null);
      })
      .catch(() => setCapacity(null))
      .finally(() => setCapacityLoading(false));
  };

  const reloadAsaasSetup = () => {
    setAsaasLoading(true);
    secureApiFetch("/api/admin/asaas-setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { ok?: boolean; setup?: typeof asaasSetup }) => {
        if (json.ok && json.setup) setAsaasSetup(json.setup);
        else setAsaasSetup(null);
      })
      .catch(() => setAsaasSetup(null))
      .finally(() => setAsaasLoading(false));
  };

  useEffect(() => {
    reloadCapacity();
    reloadAsaasSetup();
  }, []);

  const snapshot = useMemo(
    () => (data ? buildPlatformAdminSnapshot(data, cloud) : null),
    [data, cloud]
  );

  const handleAlterarSenha = async () => {
    setMsgSenha(null);
    if (novaSenha !== confirmarSenha) {
      setMsgSenha({ type: "erro", text: "A confirmação não coincide com a nova senha." });
      return;
    }
    setSalvandoSenha(true);
    try {
      const result = await alterarSenhaLoginAdmin(user.id, senhaAtual, novaSenha, user);
      if (!result.success) {
        setMsgSenha({ type: "erro", text: result.error ?? "Não foi possível alterar a senha." });
        return;
      }
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      setMsgSenha({ type: "ok", text: "Senha alterada. Use a nova senha no próximo login em /admin." });
    } finally {
      setSalvandoSenha(false);
    }
  };

  if (!data || !snapshot) {
    return <p className="text-sm text-gray-500 py-12 text-center">Carregando sistema…</p>;
  }

  const { storage, nuvem, atividadeRecente } = snapshot;
  const storageBarColor =
    storage.status === "critico"
      ? "bg-red-500"
      : storage.status === "atencao"
        ? "bg-amber-500"
        : "bg-green-500";

  return (
    <div className="space-y-6 pb-8">
      <AdminSectionHeader
        title="Sistema"
        description="Saúde da nuvem Supabase, limites do armazenamento local neste aparelho e segurança do painel admin."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Armazenamento local">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">
                  {formatBytes(storage.totalBytes)} de ~{formatBytes(storage.limiteEstimadoBytes)}
                </span>
                <span className="font-semibold tabular-nums">{storage.percentualUsado}%</span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${storageBarColor}`}
                  style={{ width: `${Math.min(100, storage.percentualUsado)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{storage.statusLabel}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Database size={14} /> Dados do app
                </dt>
                <dd className="font-semibold mt-1">{formatBytes(storage.dataBytes)}</dd>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-gray-500 flex items-center gap-1">
                  <HardDrive size={14} /> Outros caches
                </dt>
                <dd className="font-semibold mt-1">{formatBytes(storage.outrosBytes + storage.sessionBytes)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card title="Nuvem Supabase">
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              {nuvem.configured ? (
                <Cloud className="text-green-600 shrink-0 mt-0.5" size={20} />
              ) : (
                <CloudOff className="text-gray-400 shrink-0 mt-0.5" size={20} />
              )}
              <div>
                <p className="font-medium text-gray-900">
                  {nuvem.configured ? "Nuvem configurada" : "Nuvem não configurada"}
                </p>
                <p className="text-gray-500 mt-1">
                  {cloudLoading
                    ? "Consultando…"
                    : nuvem.configured
                      ? `${nuvem.cooperativasNaNuvem} cooperativa(s) na base central`
                      : "Variáveis Supabase ausentes."}
                </p>
              </div>
            </div>
            <dl className="space-y-2">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500">Tabela cooperativas</dt>
                <dd className={nuvem.cooperativasTableOk ? "text-green-700 font-medium" : "text-amber-700"}>
                  {nuvem.cooperativasTableOk ? "OK" : "Indisponível"}
                </dd>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500">Login nuvem (app_users)</dt>
                <dd className={nuvem.appUsersTableOk ? "text-green-700 font-medium" : "text-amber-700"}>
                  {nuvem.appUsersTableOk ? "OK" : "Não criada"}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Server size={14} /> Fotos de entrega
                </dt>
                <dd className="text-gray-700">Supabase Storage</dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>

      <Card
        title="Capacidade por cooperativa"
        action={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
            onClick={reloadCapacity}
            disabled={capacityLoading}
          >
            <RefreshCw size={14} className={capacityLoading ? "animate-spin" : ""} /> Atualizar
          </button>
        }
      >
        <div className="flex items-start gap-2 mb-4 text-sm text-gray-600">
          <Gauge size={18} className="text-slate-600 shrink-0 mt-0.5" />
          <p>
            Monitora limites do modelo atual: <strong>operacional.json</strong> (máx.{" "}
            {capacity?.limits.operacionalJsonMb ?? 5} MB por CNPJ), listagem de{" "}
            <strong>{capacity?.limits.cooperadosList ?? 500} cooperados</strong> e referência de{" "}
            <strong>~{capacity?.limits.browserStorageMb ?? 5} MB</strong> no navegador de cada aparelho.
            Alerta a partir de {capacity?.limits.warnPercent ?? 80}%.
          </p>
        </div>

        {capacityLoading && !capacity ? (
          <p className="text-sm text-gray-500 py-6 text-center">Medindo uso na nuvem…</p>
        ) : !capacity?.cooperativas.length ? (
          <p className="text-sm text-gray-500 py-6 text-center">Nenhuma cooperativa na nuvem.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-gray-500 text-xs">Cooperativas</p>
                <p className="font-semibold text-lg tabular-nums">{capacity.totais.cooperativas}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-gray-500 text-xs">Cooperados (total)</p>
                <p className="font-semibold text-lg tabular-nums">{capacity.totais.cooperados}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-gray-500 text-xs">Operacional (total)</p>
                <p className="font-semibold text-lg tabular-nums">
                  {formatBytes(capacity.totais.operacionalBytes)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-gray-500 text-xs">Com alerta</p>
                <p
                  className={`font-semibold text-lg tabular-nums ${
                    capacity.totais.comAlerta > 0 ? "text-amber-700" : "text-green-700"
                  }`}
                >
                  {capacity.totais.comAlerta}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Cooperativa</th>
                    <th className="px-3 py-2">Cooperados</th>
                    <th className="px-3 py-2">operacional.json</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {capacity.cooperativas.map((row) => {
                    const worstStatus =
                      row.operacionalStatus === "critico" || row.cooperadosStatus === "critico"
                        ? "critico"
                        : row.operacionalStatus === "atencao" || row.cooperadosStatus === "atencao"
                          ? "atencao"
                          : "ok";
                    return (
                      <tr key={row.cooperativaId}>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{row.nome}</p>
                          {row.alertas.length > 0 && (
                            <ul className="mt-1 text-xs text-amber-800 space-y-0.5">
                              {row.alertas.map((a) => (
                                <li key={a}>• {a}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.cooperadosCount} / {row.cooperadosLimit}
                          <div className="mt-1 h-1.5 w-24 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                row.cooperadosStatus === "critico"
                                  ? "bg-red-500"
                                  : row.cooperadosStatus === "atencao"
                                    ? "bg-amber-500"
                                    : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min(100, row.cooperadosPercent)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.operacionalMissing
                            ? "—"
                            : `${formatBytes(row.operacionalBytes)} / ${formatBytes(row.operacionalLimitBytes)}`}
                          {!row.operacionalMissing && (
                            <div className="mt-1 h-1.5 w-28 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  row.operacionalStatus === "critico"
                                    ? "bg-red-500"
                                    : row.operacionalStatus === "atencao"
                                      ? "bg-amber-500"
                                      : "bg-green-500"
                                }`}
                                style={{ width: `${Math.min(100, row.operacionalPercent)}%` }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${capacityStatusClass(worstStatus)}`}
                          >
                            {capacityStatusLabel(worstStatus)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              Atualizado em {new Date(capacity.generatedAt).toLocaleString("pt-BR")}. Fotos de entrega ficam em
              arquivos separados e não entram neste limite de 5 MB.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="PIX SaaS · Asaas"
        action={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
            onClick={reloadAsaasSetup}
            disabled={asaasLoading}
          >
            <RefreshCw size={14} className={asaasLoading ? "animate-spin" : ""} /> Atualizar
          </button>
        }
      >
        <div className="flex items-start gap-2 mb-4 text-sm text-gray-600">
          <Banknote size={18} className="text-emerald-700 shrink-0 mt-0.5" />
          <p>
            Cobrança unificada (mensalidade + repasse Conta Coop) com <strong>PIX automático</strong>. O responsável vê o
            QR Code ao abrir o painel; o cron diário também gera cobranças pendentes.
          </p>
        </div>

        {asaasLoading && !asaasSetup ? (
          <p className="text-sm text-gray-500 py-4 text-center">Verificando integração Asaas…</p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">API Asaas</dt>
              <dd className={asaasSetup?.configured ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                {asaasSetup?.configured ? "Configurada" : "Não configurada (ASAAS_API_KEY)"}
              </dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Ambiente</dt>
              <dd className="text-gray-800">{asaasSetup?.sandbox ? "Sandbox" : "Produção"}</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-gray-500">Token webhook</dt>
              <dd className={asaasSetup?.webhookTokenConfigured ? "text-green-700" : "text-amber-700"}>
                {asaasSetup?.webhookTokenConfigured ? "Definido" : "Falta ASAAS_WEBHOOK_TOKEN"}
              </dd>
            </div>
            <div className="sm:col-span-2 py-2">
              <dt className="text-gray-500 mb-1">URL do webhook (cadastrar no painel Asaas)</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 break-all">
                  {asaasSetup?.webhookUrl ?? "—"}
                </code>
                {asaasSetup?.webhookUrl && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(asaasSetup.webhookUrl).then(() => {
                        setWebhookCopied(true);
                        setTimeout(() => setWebhookCopied(false), 2000);
                      });
                    }}
                  >
                    <Copy size={14} /> {webhookCopied ? "Copiado!" : "Copiar URL"}
                  </Button>
                )}
              </dd>
              <p className="text-xs text-gray-500 mt-2">
                Eventos: <strong>PAYMENT_RECEIVED</strong> e <strong>PAYMENT_CONFIRMED</strong>. Cron:{" "}
                <code>/api/cron/hb-asaas-charges</code> (variável <code>CRON_SECRET</code> na Vercel).
              </p>
            </div>
          </dl>
        )}
      </Card>

      <Card title="Alterar senha do /admin" action={<Settings size={18} className="text-gray-400" />}>
        {msgSenha?.type === "erro" && (
          <AlertBanner variant="error" className="mb-4" title="Erro">
            {msgSenha.text}
          </AlertBanner>
        )}
        {msgSenha?.type === "ok" && (
          <AlertBanner variant="success" className="mb-4" title="Senha atualizada">
            {msgSenha.text}
          </AlertBanner>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <FormField label="Senha atual">
            <Input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <div className="hidden sm:block" />
          <FormField label="Nova senha" hint="Mínimo 6 caracteres">
            <Input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          <FormField label="Confirmar nova senha">
            <Input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
        </div>
        <Button
          className="mt-4"
          onClick={() => void handleAlterarSenha()}
          disabled={salvandoSenha || !senhaAtual || novaSenha.length < 6 || !confirmarSenha}
        >
          <Lock size={16} /> {salvandoSenha ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </Card>

      <Card title="Atividade recente" action={<Activity size={18} className="text-gray-400" />}>
        {atividadeRecente.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhum registro de auditoria.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {atividadeRecente.map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-gray-900">{entry.userName}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatDateTime(entry.timestamp)}</span>
                </div>
                <p className="text-gray-600 mt-0.5">{entry.changes ?? entry.action}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
