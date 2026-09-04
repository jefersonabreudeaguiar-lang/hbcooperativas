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
} from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Input } from "@/components/ui/Form";
import { useAppData } from "@/hooks/useAppData";
import { updateData, getData } from "@/services/dataStore";
import { pushCobrancaSaasToCloud } from "@/services/cooperativaCloudService";
import {
  COBRANCA_SAAS_MINIMO_LABEL,
  COBRANCA_SAAS_MINIMO_MES,
  COBRANCA_SAAS_PRECO_LABEL,
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
import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";
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

  const syncSaasCloud = (cooperativaId: string) => {
    const coop = getData().cooperativas.find((c) => c.id === cooperativaId);
    if (coop?.cobrancaSaas) {
      void pushCobrancaSaasToCloud(coop.cnpj, coop.cobrancaSaas);
    }
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

  const handleCobrar = (row: CobrancaSaasAdminRow) => {
    setFeedback(null);
    setBusyId(row.cooperativaId);
    try {
      updateData((d) => {
        const r = registrarCobrancaSaas(d, row.cooperativaId, user.name);
        if (!r.ok) throw new Error(r.error ?? "Não foi possível registrar a cobrança.");
        return r.data;
      });
      syncSaasCloud(row.cooperativaId);
      setFeedback({
        type: "ok",
        text: `Cobrança registrada para ${row.nome}: ${row.valorFormatado} (${row.qtdCooperados} cooperado${row.qtdCooperados === 1 ? "" : "s"}).`,
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
        description={`Mensalidade da plataforma: ${COBRANCA_SAAS_PRECO_LABEL} por cooperado cadastrado, mínimo ${COBRANCA_SAAS_MINIMO_LABEL} por cooperativa. Fluxo: registrar cobrança → aguardar pagamento → confirmar ou bloquear.`}
      />

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
        <strong>Como cobrar:</strong> clique em <em>Registrar cobrança</em> no ciclo atual. Quando o responsável
        informar pagamento, use <em>Confirmar pagamento</em>. Se necessário, envie aviso ou aplique bloqueio temporário.
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
          subtitle={`${COBRANCA_SAAS_PRECO_LABEL} / cooperado`}
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
                        {row.qtdCooperados} cooperado{row.qtdCooperados === 1 ? "" : "s"} · {row.valorFormatado}
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
                    <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3 flex flex-wrap gap-2">
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
