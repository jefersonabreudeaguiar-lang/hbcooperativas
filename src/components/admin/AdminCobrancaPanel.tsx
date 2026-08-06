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
} from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Input } from "@/components/ui/Form";
import { useAppData } from "@/hooks/useAppData";
import { updateData } from "@/services/dataStore";
import {
  COBRANCA_SAAS_MINIMO_LABEL,
  COBRANCA_SAAS_MINIMO_MES,
  COBRANCA_SAAS_PRECO_LABEL,
  bloquearTemporarioCobrancaSaas,
  confirmarPagamentoCobrancaSaas,
  desbloquearCobrancaSaas,
  enviarAvisoBloqueioCobrancaSaas,
  listarCobrancasSaasAdmin,
  registrarCobrancaSaas,
  sincronizarCicloCobrancaSaas,
  type CobrancaSaasAdminRow,
} from "@/services/cobrancaSaasService";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/format";
import type { User } from "@/types";

type AdminUser = Pick<User, "id" | "name">;

interface AdminCobrancaPanelProps {
  user: AdminUser;
}

function statusTone(status: CobrancaSaasAdminRow["statusMes"]): string {
  switch (status) {
    case "em_dia":
      return "bg-green-100 text-green-800";
    case "cobranca_enviada":
      return "bg-blue-100 text-blue-800";
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
  const [feedback, setFeedback] = useState<{ type: "ok" | "erro"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    let needsSync = false;
    for (const coop of data.cooperativas) {
      if (coop.cobrancaSaas?.cicloInicioEm) continue;
      if (data.cooperados.some((c) => c.cooperativaId === coop.id)) {
        needsSync = true;
        break;
      }
    }
    if (!needsSync) return;
    updateData((d) => {
      let next = d;
      for (const coop of d.cooperativas) {
        next = sincronizarCicloCobrancaSaas(next, coop.id);
      }
      return next;
    });
  }, [data]);

  const rows = useMemo(() => (data ? listarCobrancasSaasAdmin(data) : []), [data]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        r.cnpj.includes(q.replace(/\D/g, "")) ||
        r.cnpjFormatado.toLowerCase().includes(q)
    );
  }, [rows, busca]);

  const totais = useMemo(() => {
    const comCiclo = rows.filter((r) => r.cicloInicioEm);
    const aReceber = rows
      .filter((r) => r.statusMes === "cobranca_enviada" || r.statusMes === "aviso_bloqueio" || r.statusMes === "bloqueado")
      .reduce((s, r) => s + r.valorTotal, 0);
    const bloqueadas = rows.filter((r) => r.statusMes === "bloqueado").length;
    return {
      cooperativas: rows.length,
      comCiclo: comCiclo.length,
      cooperados: rows.reduce((s, r) => s + r.qtdCooperados, 0),
      aReceber,
      bloqueadas,
    };
  }, [rows]);

  const run = (cooperativaId: string, fn: () => void, okMsg: string) => {
    setFeedback(null);
    setBusyId(cooperativaId);
    try {
      fn();
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
        const r = confirmarPagamentoCobrancaSaas(d, row.cooperativaId);
        if (!r.ok) throw new Error(r.error ?? "Não foi possível confirmar.");
        return r.data;
      });
      setFeedback({ type: "ok", text: `Pagamento confirmado — ${row.nome} em dia.` });
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Banknote className="text-emerald-700" size={22} /> Cobrança HB · por cooperado
        </h2>
        <p className="mt-2 text-sm text-gray-600 max-w-3xl leading-relaxed">
          Cada cooperativa paga <strong>{COBRANCA_SAAS_PRECO_LABEL}</strong> por cooperado cadastrado no ciclo,
          com mínimo de <strong>{COBRANCA_SAAS_MINIMO_LABEL}</strong>. O ciclo mensal começa no dia do cadastro do
          primeiro cooperado no CNPJ — não importa o dia em que os demais entraram.
        </p>
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
          subtitle={totais.bloqueadas > 0 ? `${totais.bloqueadas} bloqueada(s)` : "Cobranças enviadas / avisos"}
          icon={<Banknote size={22} />}
          variant="gold"
        />
      </div>

      <Card
        title="Cooperativas e vencimentos"
        action={
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou CNPJ"
              className="pl-9"
            />
          </div>
        }
      >
        {filtradas.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            Nenhuma cooperativa neste aparelho. Cadastre ou sincronize cooperativas para cobrar.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 -mx-1">
            {filtradas.map((row) => {
              const busy = busyId === row.cooperativaId;
              return (
                <li
                  key={row.cooperativaId}
                  className="py-4 px-1 flex flex-col xl:flex-row xl:items-center gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{row.nome}</h3>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusTone(row.statusMes))}>
                        {row.statusLabel}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">CNPJ {row.cnpjFormatado}</p>
                    <p className="text-sm text-gray-700 mt-1">{row.mesVencimentoLabel}</p>
                    <p className="text-sm font-medium text-emerald-800 mt-1 tabular-nums">
                      {row.qtdCooperados} cooperado{row.qtdCooperados === 1 ? "" : "s"} · {row.valorFormatado}
                      {row.qtdCooperados > 0 && row.valorTotal === COBRANCA_SAAS_MINIMO_MES ? " (mínimo)" : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0 xl:justify-end">
                    <Button
                      size="sm"
                      disabled={busy || !row.cicloInicioEm || row.qtdCooperados <= 0}
                      onClick={() => handleCobrar(row)}
                      title="Registrar cobrança do ciclo atual"
                    >
                      <Send size={15} /> Cobrar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || row.statusMes === "aguardando_primeiro_cooperado"}
                      onClick={() => handleConfirmarPagamento(row)}
                    >
                      <CheckCircle2 size={15} /> Confirmar pgto
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
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
