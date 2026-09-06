"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BellRing,
  CheckCircle2,
  Lock,
  LockOpen,
  Search,
  Send,
  Users,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Input, FormField } from "@/components/ui/Form";
import { useAppData } from "@/hooks/useAppData";
import { updateData, getData } from "@/services/dataStore";
import { pushCobrancaSaasToCloud } from "@/services/cooperativaCloudService";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  applyCobrancaSaasPricingToData,
  calcularValorCobrancaSaas,
  getCobrancaSaasMinimoLabel,
  getCobrancaSaasPrecoLabel,
  getCobrancaSaasPricing,
  bloquearTemporarioCobrancaSaas,
  confirmarPagamentoCobrancaSaas,
  desbloquearCobrancaSaas,
  ensureCobrancaPeriodoAtualSaas,
  enviarAvisoBloqueioCobrancaSaas,
  listarCobrancasSaasAdmin,
  rejeitarPagamentoCobrancaSaas,
  registrarCobrancaSaas,
  sincronizarCicloCobrancaSaas,
  type CobrancaSaasAdminRow,
} from "@/services/cobrancaSaasService";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/format";
import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";
import { HbChargeBreakdownDetail } from "@/components/payments/HbChargeBreakdownDetail";
import { createAdminHbAsaasCharge, fetchAdminHbChargePreview } from "@/services/adminHbChargeApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { HbUnifiedChargeBreakdown } from "@/services/hbAsaasChargeTypes";
import type { User } from "@/types";

type AdminUser = Pick<User, "id" | "name">;
type FiltroCobranca = "todos" | "pendencias" | "bloqueadas" | "em_dia";

interface AdminCobrancaPanelProps {
  user: AdminUser;
}

function statusTone(status: CobrancaSaasAdminRow["statusMes"]): string {
  switch (status) {
    case "em_dia":
      return "bg-green-100 text-green-800";
    case "cobranca_enviada":
      return "bg-blue-100 text-blue-800";
    case "aguardando_confirmacao":
      return "bg-indigo-100 text-indigo-800";
    case "aviso_bloqueio":
      return "bg-amber-100 text-amber-900";
    case "bloqueado":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function AdminCobrancaPanel({ user }: AdminCobrancaPanelProps) {
  const data = useAppData();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroCobranca>("todos");
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "erro"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [precoInput, setPrecoInput] = useState("");
  const [minimoInput, setMinimoInput] = useState("");
  const [salvandoPrecos, setSalvandoPrecos] = useState(false);
  const [precosCarregados, setPrecosCarregados] = useState(false);
  const [previewByCoop, setPreviewByCoop] = useState<
    Record<string, { loading?: boolean; error?: string; breakdown?: HbUnifiedChargeBreakdown }>
  >({});

  const pricing = useMemo(() => getCobrancaSaasPricing(data), [data]);
  const precoLabel = useMemo(() => getCobrancaSaasPrecoLabel(data), [data]);
  const minimoLabel = useMemo(() => getCobrancaSaasMinimoLabel(data), [data]);
  const exemplo10 = useMemo(
    () => calcularValorCobrancaSaas(10, pricing).valorTotal,
    [pricing]
  );

  useEffect(() => {
    if (!data || precosCarregados) return;
    setPrecoInput(String(pricing.precoCooperado).replace(".", ","));
    setMinimoInput(String(pricing.minimoMes).replace(".", ","));
    setPrecosCarregados(true);
  }, [data, precosCarregados, pricing.minimoMes, pricing.precoCooperado]);

  useEffect(() => {
    if (!data) return;
    void secureApiFetch("/api/admin/cobranca-saas-pricing", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (json: {
          ok?: boolean;
          pricing?: { precoCooperado?: number; minimoMes?: number };
        }) => {
          if (!json.ok || !json.pricing) return;
          const cloud = getCobrancaSaasPricing({
            config: {
              descontoPadraoCooperativa: data.config.descontoPadraoCooperativa,
              cobrancaSaasPrecoCooperado: json.pricing.precoCooperado,
              cobrancaSaasMinimoMes: json.pricing.minimoMes,
            },
          });
          const local = getCobrancaSaasPricing(data);
          if (cloud.precoCooperado === local.precoCooperado && cloud.minimoMes === local.minimoMes) {
            return;
          }
          updateData((d) => applyCobrancaSaasPricingToData(d, cloud));
          setPrecoInput(String(cloud.precoCooperado).replace(".", ","));
          setMinimoInput(String(cloud.minimoMes).replace(".", ","));
        }
      )
      .catch(() => undefined);
  }, [data]);

  const parseMoneyInput = (value: string): number | null => {
    const normalized = value.trim().replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  };

  const handleSalvarPrecos = async () => {
    setFeedback(null);
    const precoCooperado = parseMoneyInput(precoInput);
    const minimoMes = parseMoneyInput(minimoInput);
    if (precoCooperado == null || minimoMes == null) {
      setFeedback({ type: "erro", text: "Informe valores válidos (≥ 0) para cooperado e mínimo mensal." });
      return;
    }

    setSalvandoPrecos(true);
    try {
      const payload = { precoCooperado, minimoMes };
      updateData((d) => applyCobrancaSaasPricingToData(d, payload));

      const res = await secureApiFetch("/api/admin/cobranca-saas-pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; warning?: string };
      if (!json.ok) {
        setFeedback({
          type: "erro",
          text: json.error ?? "Valores salvos localmente, mas não foi possível gravar na nuvem.",
        });
        return;
      }
      setFeedback({
        type: "ok",
        text:
          json.warning ??
          `Valores atualizados: ${formatCurrency(precoCooperado)}/cooperado · mín. ${formatCurrency(minimoMes)}. Ciclo de adesão inalterado.`,
      });
    } finally {
      setSalvandoPrecos(false);
    }
  };

  const loadCloudPreview = async (cooperativaId: string, cnpj: string) => {
    setPreviewByCoop((prev) => ({
      ...prev,
      [cooperativaId]: { loading: true, error: undefined, breakdown: prev[cooperativaId]?.breakdown },
    }));
    try {
      const breakdown = await fetchAdminHbChargePreview(cnpj);
      setPreviewByCoop((prev) => ({
        ...prev,
        [cooperativaId]: { loading: false, breakdown },
      }));
    } catch (e) {
      setPreviewByCoop((prev) => ({
        ...prev,
        [cooperativaId]: {
          loading: false,
          error: e instanceof Error ? e.message : "Erro ao carregar cobrança da nuvem.",
        },
      }));
    }
  };

  useEffect(() => {
    if (!data?.cooperativas.length) return;
    updateData((d) => {
      let next = d;
      let changed = false;
      for (const coop of d.cooperativas) {
        const before = JSON.stringify(coop.cobrancaSaas ?? {});
        next = sincronizarCicloCobrancaSaas(next, coop.id);
        next = ensureCobrancaPeriodoAtualSaas(next, coop.id).data;
        const after = JSON.stringify(next.cooperativas.find((c) => c.id === coop.id)?.cobrancaSaas ?? {});
        if (before !== after) changed = true;
      }
      return changed ? next : d;
    });
  }, [data?.cooperativas.length, data?.cooperados.length]);

  const rows = useMemo(() => (data ? listarCobrancasSaasAdmin(data) : []), [data]);

  useEffect(() => {
    if (!expandidoId) return;
    const row = rows.find((r) => r.cooperativaId === expandidoId);
    if (!row?.cnpj) return;
    const cached = previewByCoop[expandidoId];
    if (cached?.loading || cached?.breakdown) return;
    void loadCloudPreview(expandidoId, row.cnpj);
  }, [expandidoId, rows, previewByCoop]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      const matchBusca =
        !q ||
        r.nome.toLowerCase().includes(q) ||
        r.cnpj.includes(q.replace(/\D/g, "")) ||
        r.cnpjFormatado.toLowerCase().includes(q);

      const matchFiltro =
        filtro === "todos" ||
        (filtro === "pendencias" &&
          (r.aguardandoConfirmacao ||
            r.statusMes === "cobranca_enviada" ||
            r.statusMes === "aviso_bloqueio")) ||
        (filtro === "bloqueadas" && r.statusMes === "bloqueado") ||
        (filtro === "em_dia" && r.statusMes === "em_dia");

      return matchBusca && matchFiltro;
    });
  }, [rows, busca, filtro]);

  const totais = useMemo(() => {
    const comCiclo = rows.filter((r) => r.cicloInicioEm);
    const aReceber = rows
      .filter(
        (r) =>
          r.statusMes === "cobranca_enviada" ||
          r.statusMes === "aguardando_confirmacao" ||
          r.statusMes === "aviso_bloqueio" ||
          r.statusMes === "bloqueado"
      )
      .reduce((s, r) => s + r.valorTotal, 0);
    const aguardandoConfirmacao = rows.filter((r) => r.aguardandoConfirmacao).length;
    const bloqueadas = rows.filter((r) => r.statusMes === "bloqueado").length;
    return {
      cooperativas: rows.length,
      comCiclo: comCiclo.length,
      cooperados: rows.reduce((s, r) => s + r.qtdCooperados, 0),
      aReceber,
      bloqueadas,
      aguardandoConfirmacao,
    };
  }, [rows]);

  const syncSaasCloud = async (cooperativaId: string): Promise<boolean> => {
    const coop = getData().cooperativas.find((c) => c.id === cooperativaId);
    if (!coop?.cobrancaSaas) return true;
    return pushCobrancaSaasToCloud(coop.cnpj, coop.cobrancaSaas);
  };

  const run = (cooperativaId: string, fn: () => void, okMsg: string) => {
    setFeedback(null);
    setBusyId(cooperativaId);
    try {
      fn();
      syncSaasCloud(cooperativaId);
      setFeedback({ type: "ok", text: okMsg });
    } catch (e) {
      setFeedback({ type: "erro", text: e instanceof Error ? e.message : "Falha ao aplicar ação." });
    } finally {
      setBusyId(null);
    }
  };

  const handleCobrar = async (row: CobrancaSaasAdminRow) => {
    setFeedback(null);
    setBusyId(row.cooperativaId);
    try {
      updateData((d) => {
        const r = registrarCobrancaSaas(d, row.cooperativaId, user.name);
        if (!r.ok) throw new Error(r.error ?? "Não foi possível registrar a cobrança.");
        return r.data;
      });
      const synced = await syncSaasCloud(row.cooperativaId);
      const preview = previewByCoop[row.cooperativaId]?.breakdown;
      const totalLabel =
        preview && preview.totalCents > 0
          ? formatCentsBRL(preview.totalCents)
          : row.valorFormatado;

      let pixMsg = "";
      if (preview && preview.totalCents > 0) {
        const pix = await createAdminHbAsaasCharge(row.cnpj, preview.mesReferenciaContaCoop);
        if (pix.ok && pix.pixGenerated) {
          pixMsg = " PIX Asaas gerado automaticamente na nuvem.";
        } else if (!pix.ok && pix.error) {
          pixMsg = ` Aviso PIX: ${pix.error}`;
        }
      }

      setFeedback({
        type: synced ? "ok" : "erro",
        text: synced
          ? `Cobrança registrada para ${row.nome}: ${totalLabel} (${row.qtdCooperados} cooperado${row.qtdCooperados === 1 ? "" : "s"}${preview?.repasseDue ? ` + repasse HB Créditos ${CONTA_COOP_DESCONTO_SPLIT.appPercent}%` : ""}).${pixMsg}`
          : `Cobrança registrada localmente, mas falhou ao publicar na nuvem. O responsável não verá o PIX até sincronizar.${pixMsg}`,
      });
    } catch (e) {
      setFeedback({ type: "erro", text: e instanceof Error ? e.message : "Falha ao aplicar ação." });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmarPagamento = (row: CobrancaSaasAdminRow) => {
    setFeedback(null);
    setBusyId(row.cooperativaId);
    try {
      updateData((d) => {
        const r = confirmarPagamentoCobrancaSaas(d, row.cooperativaId, user.name);
        if (!r.ok) throw new Error(r.error ?? "Não foi possível confirmar.");
        return r.data;
      });
      syncSaasCloud(row.cooperativaId);
      setFeedback({ type: "ok", text: `Pagamento confirmado — ${row.nome} em dia.` });
    } catch (e) {
      setFeedback({ type: "erro", text: e instanceof Error ? e.message : "Falha ao aplicar ação." });
    } finally {
      setBusyId(null);
    }
  };

  const handleRejeitarPagamento = (row: CobrancaSaasAdminRow) => {
    const motivo = window.prompt(
      `Recusar pagamento informado por ${row.nome}?\n\nOpcional: descreva o motivo para o responsável.`
    );
    if (motivo === null) return;
    setFeedback(null);
    setBusyId(row.cooperativaId);
    try {
      updateData((d) => {
        const r = rejeitarPagamentoCobrancaSaas(d, row.cooperativaId, user.name, motivo);
        if (!r.ok) throw new Error(r.error ?? "Não foi possível recusar.");
        return r.data;
      });
      syncSaasCloud(row.cooperativaId);
      setFeedback({ type: "ok", text: `Pagamento não confirmado — ${row.nome} notificado.` });
    } catch (e) {
      setFeedback({ type: "erro", text: e instanceof Error ? e.message : "Falha ao aplicar ação." });
    } finally {
      setBusyId(null);
    }
  };

  const handleAviso = (row: CobrancaSaasAdminRow) => {
    run(
      row.cooperativaId,
      () => {
        updateData((d) => enviarAvisoBloqueioCobrancaSaas(d, row.cooperativaId));
      },
      `Aviso de bloqueio enviado ao responsável de ${row.nome}.`
    );
  };

  const handleBloquear = (row: CobrancaSaasAdminRow) => {
    if (
      !window.confirm(
        `Aplicar bloqueio temporário em "${row.nome}"?\n\nO responsável verá um aviso destacado na área da cooperativa. Os fluxos do app continuam acessíveis, com alerta permanente até o desbloqueio.`
      )
    ) {
      return;
    }
    run(
      row.cooperativaId,
      () => {
        updateData((d) => bloquearTemporarioCobrancaSaas(d, row.cooperativaId, user.name));
      },
      `Bloqueio temporário aplicado em ${row.nome}.`
    );
  };

  const handleDesbloquear = (row: CobrancaSaasAdminRow) => {
    run(
      row.cooperativaId,
      () => {
        updateData((d) => desbloquearCobrancaSaas(d, row.cooperativaId));
      },
      `Bloqueio removido — ${row.nome}.`
    );
  };

  if (!data) {
    return <p className="text-sm text-gray-500 py-8 text-center">Carregando cobranças…</p>;
  }

  return (
    <div className="space-y-6 pb-8">
      <AdminSectionHeader
        title="Cobrança HB"
        description={`Mensalidade por cooperado (ciclo da adesão) + taxa HB Créditos (${CONTA_COOP_DESCONTO_SPLIT.appPercent}%) após pagamentos dos cooperados no ciclo de entregas. Valores apurados na nuvem.`}
      />

      <Card
        title="Valores da cobrança"
        action={
          <Settings2 size={18} className="text-emerald-700" aria-hidden />
        }
      >
        <p className="text-sm text-gray-600 mb-4">
          Defina quanto cada cooperativa paga por cooperado cadastrado no ciclo mensal. Os novos valores
          passam a valer nas próximas cobranças registradas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <FormField label="Valor por cooperado (R$)">
            <Input
              inputMode="decimal"
              value={precoInput}
              onChange={(e) => setPrecoInput(e.target.value)}
              placeholder="14,90"
            />
          </FormField>
          <FormField label="Mínimo mensal por cooperativa (R$)">
            <Input
              inputMode="decimal"
              value={minimoInput}
              onChange={(e) => setMinimoInput(e.target.value)}
              placeholder="149,00"
            />
          </FormField>
          <div className="lg:col-span-1">
            <Button
              type="button"
              className="w-full"
              disabled={salvandoPrecos}
              onClick={() => void handleSalvarPrecos()}
            >
              {salvandoPrecos ? "Salvando…" : "Salvar valores"}
            </Button>
          </div>
          <div className="sm:col-span-2 lg:col-span-1 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Exemplo</p>
            <p className="mt-1">
              10 cooperados → <strong>{formatCurrency(exemplo10)}</strong>
            </p>
            <p className="text-xs text-slate-500 mt-1">Ciclo conta desde o 1º cooperado</p>
          </div>
        </div>
      </Card>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
        <strong>Como cobrar:</strong> expanda a cooperativa para ver o detalhamento unificado (mensalidade + repasse
        HB Créditos) calculado na nuvem. Ao registrar a cobrança, o <strong>PIX Asaas é gerado automaticamente</strong> na
        nuvem; o responsável também vê o QR Code ao abrir o painel. A confirmação do pagamento é automática via webhook.
      </div>

      {feedback?.type === "ok" && (
        <AlertBanner variant="success" title="Pronto" onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </AlertBanner>
      )}
      {feedback?.type === "erro" && (
        <AlertBanner variant="error" title="Não foi possível" onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </AlertBanner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Cooperativas" value={String(totais.cooperativas)} icon={<Users size={22} />} />
        <StatCard
          title="Com ciclo iniciado"
          value={String(totais.comCiclo)}
          subtitle="Após o 1º cooperado"
          icon={<CheckCircle2 size={22} />}
          variant="success"
        />
        <StatCard
          title="Cooperados (cobrança)"
          value={String(totais.cooperados)}
          subtitle={`${precoLabel} / cooperado`}
          icon={<Users size={22} />}
        />
        <StatCard
          title="Em aberto (estimado)"
          value={formatCurrency(totais.aReceber)}
          subtitle={
            totais.aguardandoConfirmacao > 0
              ? `${totais.aguardandoConfirmacao} aguardando confirmação`
              : totais.bloqueadas > 0
                ? `${totais.bloqueadas} suspensa(s)`
                : "Cobranças do ciclo"
          }
          icon={<Banknote size={22} />}
          variant="gold"
        />
      </div>

      <Card
        title="Cooperativas"
        action={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-56">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nome ou CNPJ"
                className="pl-9"
              />
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              ["todos", "Todas"],
              ["pendencias", "Pendências"],
              ["bloqueadas", "Bloqueadas"],
              ["em_dia", "Em dia"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                filtro === id
                  ? "bg-emerald-700 border-emerald-700 text-white"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            Nenhuma cooperativa encontrada com os filtros atuais.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtradas.map((row) => {
              const busy = busyId === row.cooperativaId;
              const expandido = expandidoId === row.cooperativaId;
              const preview = previewByCoop[row.cooperativaId];
              const cloudTotal = preview?.breakdown?.totalCents ?? 0;
              const proximaAcao =
                row.aguardandoConfirmacao
                  ? "confirmar"
                  : row.statusMes === "bloqueado"
                    ? "desbloquear"
                    : row.cicloInicioEm && row.qtdCooperados > 0
                      ? "cobrar"
                      : "aguardar";

              return (
                <li
                  key={row.cooperativaId}
                  className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                >
                  <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{row.nome}</h3>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusTone(row.statusMes))}>
                          {row.statusLabel}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">CNPJ {row.cnpjFormatado}</p>
                      <p className="text-sm font-medium text-emerald-800 mt-2 tabular-nums">
                        {row.qtdCooperados} cooperado{row.qtdCooperados === 1 ? "" : "s"} · mensalidade{" "}
                        {row.valorFormatado}
                        {cloudTotal > 0 && (
                          <>
                            {" "}
                            · total nuvem{" "}
                            <strong className="text-emerald-900">{formatCentsBRL(cloudTotal)}</strong>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{row.mesVencimentoLabel}</p>
                      {row.aguardandoConfirmacao && row.informadoPagamentoPor && (
                        <p className="text-xs text-indigo-700 mt-2">
                          Pagamento informado por {row.informadoPagamentoPor}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      {proximaAcao === "cobrar" && (
                        <Button size="sm" disabled={busy} onClick={() => handleCobrar(row)}>
                          <Send size={15} /> Registrar cobrança
                        </Button>
                      )}
                      {proximaAcao === "confirmar" && (
                        <Button size="sm" disabled={busy} onClick={() => handleConfirmarPagamento(row)}>
                          <CheckCircle2 size={15} /> Confirmar pagamento
                        </Button>
                      )}
                      {proximaAcao === "desbloquear" && (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleDesbloquear(row)}>
                          <LockOpen size={15} /> Desbloquear
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setExpandidoId(expandido ? null : row.cooperativaId)}
                      >
                        <ChevronDown size={15} className={cn("transition-transform", expandido && "rotate-180")} />
                        Mais ações
                      </Button>
                    </div>
                  </div>

                  {expandido && (
                    <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">
                          Cobrança unificada · sincronizada com HB Créditos
                        </h4>
                        {preview?.loading && (
                          <p className="text-sm text-gray-500">Calculando valores reais na nuvem…</p>
                        )}
                        {preview?.error && (
                          <AlertBanner variant="error">{preview.error}</AlertBanner>
                        )}
                        {preview?.breakdown && (
                          <HbChargeBreakdownDetail breakdown={preview.breakdown} compact />
                        )}
                        {!preview?.loading && !preview?.breakdown && !preview?.error && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void loadCloudPreview(row.cooperativaId, row.cnpj)}
                          >
                            Atualizar valores da nuvem
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleCobrar(row)}>
                        <Send size={15} /> Cobrar
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleConfirmarPagamento(row)}>
                        <CheckCircle2 size={15} /> Confirmado
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || !row.aguardandoConfirmacao}
                        onClick={() => handleRejeitarPagamento(row)}
                        className="border-red-200 text-red-800 hover:bg-red-50"
                      >
                        Não confirmado
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || row.statusMes === "bloqueado"}
                        onClick={() => handleAviso(row)}
                        className="border-amber-200 text-amber-900 hover:bg-amber-50"
                      >
                        <BellRing size={15} /> Aviso bloqueio
                      </Button>
                      {row.statusMes === "bloqueado" ? (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleDesbloquear(row)}>
                          <LockOpen size={15} /> Desbloquear
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => handleBloquear(row)}
                          className="border-red-200 text-red-800 hover:bg-red-50"
                        >
                          <Lock size={15} /> Bloqueio temp.
                        </Button>
                      )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
