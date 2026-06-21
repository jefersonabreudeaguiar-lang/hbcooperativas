"use client";

import { useState, useMemo } from "react";
import { CheckCircle, Lock, FileCheck, Download, Printer, FileText } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, DataTable } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { calcularFechamentoMensal, listMesesComLancamentos } from "@/services/dashboardService";
import { calcularFechamentoMensalLive } from "@/services/relatorioService";
import {
  baixarDocumento,
  gerarRelatorioFechamentoHtml,
  imprimirDocumentoHtml,
  nomeArquivoRelatorio,
} from "@/utils/relatorioHtml";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { FechamentoMensal } from "@/types";

export default function FechamentoMensalPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [selectedMes, setSelectedMes] = useState(getCurrentMesReferencia());

  const meses = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    return listMesesComLancamentos(data);
  }, [data]);

  if (!data || !user) return null;

  const fechamento = data.fechamentos.find((f) => f.mesReferencia === selectedMes);
  const calculoLive = calcularFechamentoMensalLive(selectedMes, data);
  const calculo = calcularFechamentoMensal(selectedMes, data);
  const isBloqueado = fechamento?.bloqueado ?? false;

  const exportarDocumento = () => {
    const html = gerarRelatorioFechamentoHtml(data, selectedMes, fechamento);
    void baixarDocumento(html, nomeArquivoRelatorio("fechamento", selectedMes));
  };

  const imprimir = () => {
    const html = gerarRelatorioFechamentoHtml(data, selectedMes, fechamento);
    imprimirDocumentoHtml(html);
  };

  const handleRevisar = () => {
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = { ...d };
      const fcData: FechamentoMensal = {
        id: fechamento?.id ?? `fc_${Date.now()}`,
        mesReferencia: selectedMes,
        status: "revisado",
        totalVendas: calculo.totalVendas ?? 0,
        totalPagamentos: calculo.totalPagamentos ?? 0,
        totalMensalidades: calculo.totalMensalidades ?? 0,
        totalCotas: calculo.totalCotas ?? 0,
        totalDescontos: calculo.totalDescontos ?? 0,
        saldoCooperativa: calculo.saldoCooperativa ?? 0,
        revisadoPor: user.name,
        dataRevisao: now.split("T")[0],
        bloqueado: false,
        createdAt: fechamento?.createdAt ?? now,
        updatedAt: now,
      };
      if (fechamento) {
        updated.fechamentos = d.fechamentos.map((f) => (f.mesReferencia === selectedMes ? fcData : f));
      } else {
        updated.fechamentos = [...d.fechamentos, fcData];
      }
      return addAuditEntry(updated, {
        entityType: "fechamento",
        entityId: fcData.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: "Revisado com dados dos lançamentos",
      });
    });
  };

  const handleAprovar = () => {
    if (!fechamento) return;
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = { ...d };
      updated.fechamentos = d.fechamentos.map((f) =>
        f.mesReferencia === selectedMes
          ? {
              ...f,
              status: "aprovado" as const,
              aprovadoPor: user.name,
              dataAprovacao: now.split("T")[0],
              bloqueado: true,
              updatedAt: now,
              totalVendas: calculo.totalVendas ?? f.totalVendas,
              totalPagamentos: calculo.totalPagamentos ?? f.totalPagamentos,
              totalMensalidades: calculo.totalMensalidades ?? f.totalMensalidades,
              totalCotas: calculo.totalCotas ?? f.totalCotas,
              totalDescontos: calculo.totalDescontos ?? f.totalDescontos,
              saldoCooperativa: calculo.saldoCooperativa ?? f.saldoCooperativa,
            }
          : f
      );
      updated.financeiro = d.financeiro.map((f) =>
        f.mesReferencia === selectedMes ? { ...f, status: "aprovado" as const } : f
      );
      return addAuditEntry(updated, {
        entityType: "fechamento",
        entityId: fechamento.id,
        action: "aprovar",
        userId: user.id,
        userName: user.name,
      });
    });
  };

  return (
    <div>
      <PageHeader
        title="Fechamento Mensal"
        subtitle="Totais calculados automaticamente a partir das entregas e pagamentos do mês"
        action={
          check("fechamento", "export") ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={exportarDocumento}>
                <Download size={16} /> PDF
              </Button>
              <Button size="sm" onClick={imprimir}>
                <Printer size={16} /> Imprimir
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {meses.map((m) => (
          <Button
            key={m}
            variant={selectedMes === m ? "primary" : "secondary"}
            size="sm"
            onClick={() => setSelectedMes(m)}
          >
            {formatMesReferencia(m)}
          </Button>
        ))}
      </div>

      {isBloqueado && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <Lock size={20} />
          <span className="text-sm font-medium">Este mês está bloqueado para edição.</span>
        </div>
      )}

      <p className="text-sm text-gray-600 mb-4 flex items-center gap-2">
        <FileText size={16} className="text-green-700" />
        {calculoLive.qtdEntregas} entrega(s) · {calculoLive.qtdCooperadosPagos} pagamento(s) confirmado(s) ·{" "}
        {calculoLive.qtdCooperadosAPagar} cooperado(s) a pagar
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Vendas" value={formatCurrency(calculo.totalVendas ?? 0)} />
        <StatCard title="Total Pagamentos" value={formatCurrency(calculo.totalPagamentos ?? 0)} variant="success" />
        <StatCard title="Mensalidades" value={formatCurrency(calculo.totalMensalidades ?? 0)} />
        <StatCard title="Cotas" value={formatCurrency(calculo.totalCotas ?? 0)} />
        <StatCard title="Descontos" value={formatCurrency(calculo.totalDescontos ?? 0)} variant="warning" />
        <StatCard title="Saldo Cooperativa" value={formatCurrency(calculo.saldoCooperativa ?? 0)} variant="gold" />
      </div>

      <Card title={`Cooperados · ${formatMesReferencia(selectedMes)}`} className="mb-6">
        <DataTable
          data={calculoLive.linhasCooperado}
          keyField="cooperadoId"
          columns={[
            { key: "nome", label: "Cooperado", render: (l) => l.cooperadoNome },
            { key: "entregas", label: "Entregas" },
            { key: "bruto", label: "Bruto", render: (l) => formatCurrency(l.valorBruto) },
            { key: "pagar", label: "A pagar", render: (l) => formatCurrency(l.aPagar) },
            { key: "pago", label: "Pago", render: (l) => formatCurrency(l.pago) },
            {
              key: "status",
              label: "Situação",
              render: (l) => (
                <StatusBadge
                  status={
                    l.statusPagamento === "pago"
                      ? "pago"
                      : l.statusPagamento === "pendente"
                        ? "pendente"
                        : l.statusPagamento === "aguardando_assinatura"
                          ? "aguardando_conferencia"
                          : "inativo"
                  }
                />
              ),
            },
          ]}
          emptyMessage="Nenhum lançamento neste mês."
        />
      </Card>

      <Card title="Status do Fechamento" className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={fechamento?.status ?? "rascunho"} />
            {fechamento?.revisadoPor && (
              <span className="text-sm text-gray-500">Revisado por: {fechamento.revisadoPor}</span>
            )}
            {fechamento?.aprovadoPor && (
              <span className="text-sm text-gray-500">Aprovado por: {fechamento.aprovadoPor}</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {check("fechamento", "edit") && !isBloqueado && (
              <Button onClick={handleRevisar} variant="secondary">
                <FileCheck size={18} /> Revisar e salvar
              </Button>
            )}
            {check("fechamento", "approve") && fechamento?.status === "revisado" && !isBloqueado && (
              <Button onClick={handleAprovar} variant="gold">
                <CheckCircle size={18} /> Aprovar Fechamento
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card title="Histórico de Auditoria">
        <DataTable
          data={data.auditLog.filter((a) => a.entityType === "fechamento").slice(0, 10)}
          keyField="id"
          columns={[
            { key: "timestamp", label: "Data", render: (a) => formatDate(a.timestamp) },
            { key: "userName", label: "Usuário" },
            {
              key: "action",
              label: "Ação",
              render: (a) => (
                <StatusBadge status={a.action === "aprovar" ? "aprovado" : "revisado"} />
              ),
            },
            { key: "changes", label: "Detalhes", render: (a) => a.changes ?? a.justification ?? "—" },
          ]}
          emptyMessage="Nenhum registro de auditoria."
        />
      </Card>
    </div>
  );
}
