"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Lock,
  Building2,
  Users,
  Mail,
  HardDrive,
  Cloud,
  CloudOff,
  ChevronDown,
  ChevronUp,
  Activity,
  Settings,
  Calendar,
  Clock,
  Database,
  Server,
  UserCheck,
  Package,
} from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Input, FormField } from "@/components/ui/Form";
import { useAppData } from "@/hooks/useAppData";
import { formatDate, formatDateTime } from "@/utils/format";
import { alterarSenhaLoginAdmin } from "@/services/adminAreaService";
import {
  buildPlatformAdminSnapshot,
  formatBytes,
  formatTempoUso,
  type CloudPlatformOverview,
  type CooperativaPlatformRow,
} from "@/services/platformAdminService";
import type { User } from "@/types";

type AdminUser = Pick<User, "id" | "name">;

interface PlatformAdminDashboardProps {
  user: AdminUser;
}

export function PlatformAdminDashboard({ user }: PlatformAdminDashboardProps) {
  const data = useAppData();
  const [cloud, setCloud] = useState<CloudPlatformOverview | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSenhaPanel, setShowSenhaPanel] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState<{ type: "ok" | "erro"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCloudLoading(true);
    fetch("/api/admin/platform-overview", { cache: "no-store" })
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
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        Carregando visão geral da plataforma…
      </div>
    );
  }

  const { totais, cooperativas, storage, nuvem, atividadeRecente } = snapshot;
  const storageBarColor =
    storage.status === "critico"
      ? "bg-red-500"
      : storage.status === "atencao"
        ? "bg-amber-500"
        : "bg-green-500";

  return (
    <div className="space-y-8 pb-10">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-slate-300 text-sm mb-2">
              <Shield size={16} />
              <span>Painel do criador · informações gerais da plataforma</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              HB Cooperativas — visão geral
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Cooperativas cadastradas, cooperados, tempo de uso, e-mails de acesso e limites do
              armazenamento local e da nuvem. Atualizado em {formatDateTime(snapshot.geradoEm)}.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 shrink-0"
            onClick={() => {
              setShowSenhaPanel((v) => !v);
              setMsgSenha(null);
            }}
          >
            <Settings size={16} /> Alterar senha
          </Button>
        </div>
      </div>

      {showSenhaPanel && (
        <Card title="Alterar senha de acesso ao /admin" className="border-amber-200 bg-amber-50/30">
          {msgSenha?.type === "erro" && (
            <AlertBanner variant="error" title="Erro" className="mb-4">
              {msgSenha.text}
            </AlertBanner>
          )}
          {msgSenha?.type === "ok" && (
            <AlertBanner variant="success" title="Senha atualizada" className="mb-4">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void handleAlterarSenha()}
              disabled={salvandoSenha || !senhaAtual || novaSenha.length < 6 || !confirmarSenha}
            >
              <Lock size={16} /> {salvandoSenha ? "Salvando…" : "Salvar nova senha"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowSenhaPanel(false);
                setSenhaAtual("");
                setNovaSenha("");
                setConfirmarSenha("");
                setMsgSenha(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Resumo da plataforma
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Cooperativas"
            value={String(totais.cooperativas)}
            subtitle={`${totais.cooperativasAtivas} ativa(s)`}
            icon={<Building2 size={24} />}
            variant="success"
          />
          <StatCard
            title="Cooperados"
            value={String(totais.cooperados)}
            subtitle={`${totais.cooperadosAtivos} ativo(s)`}
            icon={<Users size={24} />}
          />
          <StatCard
            title="Usuários com login"
            value={String(totais.usuarios)}
            subtitle={`${totais.usuariosAtivos} ativo(s)`}
            icon={<UserCheck size={24} />}
          />
          <StatCard
            title="Tempo médio de uso"
            value={formatTempoUso(totais.mediaDiasUso)}
            subtitle={`${totais.entregas} entrega(s) registradas`}
            icon={<Clock size={24} />}
            variant="gold"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Limites do armazenamento local">
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
            <div className="text-xs text-gray-500 border-t border-gray-100 pt-3">
              <p className="font-medium text-gray-700 mb-2">Registros neste aparelho</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>{storage.totaisRegistros.cooperativas} cooperativa(s)</span>
                <span>{storage.totaisRegistros.cooperados} cooperado(s)</span>
                <span>{storage.totaisRegistros.usuarios} usuário(s)</span>
                <span>{storage.totaisRegistros.entregas} entrega(s)</span>
                <span>{storage.totaisRegistros.mensalidades} mensalidade(s)</span>
              </div>
            </div>
            {storage.maioresChaves.length > 0 && (
              <div className="text-xs">
                <p className="font-medium text-gray-700 mb-2">Maiores itens no navegador</p>
                <ul className="space-y-1">
                  {storage.maioresChaves.map((k) => (
                    <li key={k.chave} className="flex justify-between text-gray-600">
                      <span>{k.label}</span>
                      <span className="tabular-nums">{formatBytes(k.bytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <Card title="Servidor e nuvem (Supabase)">
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
                    ? "Consultando cadastros na nuvem…"
                    : nuvem.configured
                      ? `${nuvem.cooperativasNaNuvem} cooperativa(s) na base central`
                      : "Variáveis Supabase ausentes — só dados deste aparelho."}
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
                <dt className="text-gray-500">Tabela app_users (login nuvem)</dt>
                <dd className={nuvem.appUsersTableOk ? "text-green-700 font-medium" : "text-amber-700"}>
                  {nuvem.appUsersTableOk ? "OK" : "Não criada"}
                </dd>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <dt className="text-gray-500">Cooperativas só na nuvem</dt>
                <dd className="font-medium">{nuvem.cooperativasSoNaNuvem}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-gray-500 flex items-center gap-1">
                  <Server size={14} /> Fotos de entrega
                </dt>
                <dd className="text-gray-700">Supabase Storage (fora do limite local)</dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500 bg-slate-50 rounded-lg p-3">
              O limite de ~5 MB é do navegador (localStorage). Fotos enviadas à nuvem não entram nessa
              conta. Se o uso passar de 70%, oriente as cooperativas a sincronizar entregas antigas.
            </p>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Building2 size={16} /> Cooperativas cadastradas
        </h2>
        {cooperativas.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500 py-6 text-center">
              Nenhuma cooperativa cadastrada neste aparelho ou na nuvem.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {cooperativas.map((coop) => (
              <CooperativaCard
                key={coop.id + coop.cnpj}
                coop={coop}
                expanded={expandedId === coop.id}
                onToggle={() => setExpandedId((id) => (id === coop.id ? null : coop.id))}
              />
            ))}
          </div>
        )}
      </section>

      <Card title="Atividade recente na plataforma" action={<Activity size={18} className="text-gray-400" />}>
        {atividadeRecente.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhum registro de auditoria.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {atividadeRecente.map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-gray-900">{entry.userName}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {formatDateTime(entry.timestamp)}
                  </span>
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

function CooperativaCard({
  coop,
  expanded,
  onToggle,
}: {
  coop: CooperativaPlatformRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusClass =
    coop.status === "ativa"
      ? "bg-green-100 text-green-800"
      : "bg-gray-100 text-gray-600";

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 sm:p-5 hover:bg-gray-50/80 transition-colors"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 truncate">{coop.nome}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                {coop.status === "ativa" ? "Ativa" : "Inativa"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {coop.origem === "local"
                  ? "Local"
                  : coop.origem === "nuvem"
                    ? "Nuvem"
                    : "Local + nuvem"}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              CNPJ {coop.cnpjFormatado}
              {coop.responsavel && ` · ${coop.responsavel}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm shrink-0">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{coop.totalCooperados}</p>
              <p className="text-xs text-gray-500">cooperados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{coop.usuariosComLogin}</p>
              <p className="text-xs text-gray-500">logins</p>
            </div>
            <div className="text-center hidden md:block">
              <p className="text-sm font-semibold text-gray-800">{coop.tempoUsoLabel}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 justify-center">
                <Calendar size={12} /> desde {formatDate(coop.cadastradaEm)}
              </p>
            </div>
            {expanded ? <ChevronUp size={20} className="text-gray-400 self-center" /> : <ChevronDown size={20} className="text-gray-400 self-center" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 sm:p-5 bg-gray-50/50 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <InfoChip icon={<Clock size={14} />} label="Tempo de uso" value={coop.tempoUsoLabel} />
            <InfoChip
              icon={<Calendar size={14} />}
              label="Cadastro"
              value={formatDate(coop.cadastradaEm)}
            />
            <InfoChip
              icon={<Activity size={14} />}
              label="Última atividade"
              value={
                coop.ultimaAtividade
                  ? `${formatDateTime(coop.ultimaAtividade)} (${coop.diasDesdeUltimaAtividade ?? 0}d)`
                  : "—"
              }
            />
            <InfoChip
              icon={<Package size={14} />}
              label="Entregas"
              value={`${coop.totalEntregas} total · ${coop.entregasNoMes} no mês`}
            />
          </div>

          {coop.emailCooperativa && (
            <p className="text-sm text-gray-600">
              <Mail size={14} className="inline mr-1 text-gray-400" />
              E-mail da cooperativa: <strong>{coop.emailCooperativa}</strong>
              {coop.telefone && ` · ${coop.telefone}`}
            </p>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <Mail size={16} /> E-mails cadastrados ({coop.emails.length})
            </p>
            {coop.emails.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum e-mail de login vinculado a esta cooperativa.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Função</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {coop.emails.map((m, i) => (
                      <tr key={`${m.email}-${i}`}>
                        <td className="px-3 py-2 font-medium text-gray-900">{m.nome}</td>
                        <td className="px-3 py-2 text-gray-700 break-all">{m.email}</td>
                        <td className="px-3 py-2 capitalize text-gray-600">{m.tipo}</td>
                        <td className="px-3 py-2 text-gray-600">{m.funcao ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              m.ativo ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {m.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">{icon} {label}</p>
      <p className="font-medium text-gray-900 text-sm">{value}</p>
    </div>
  );
}
