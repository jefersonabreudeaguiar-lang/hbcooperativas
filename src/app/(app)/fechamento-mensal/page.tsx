"use client";

import { useState } from "react";
import { CheckCircle, Lock, FileCheck } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { calcularFechamentoMensal } from "@/services/dashboardService";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { FechamentoMensal } from "@/types";

export default function FechamentoMensalPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const [selectedMes, setSelectedMes] = useState(getCurrentMesReferencia());

  if (!data || !user) return null;

  const fechamento = data.fechamentos.find((f) => f.mesReferencia === selectedMes);
  const calculo = calcularFechamentoMensal(selectedMes, data);
  const isBloqueado = fechamento?.bloqueado ?? false;

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
        updated.fechamentos = d.fechamentos.map((f) => f.mesReferencia === selectedMes ? fcData : f);
      } else {
        updated.fechamentos = [...d.fechamentos, fcData];
      }
      return addAuditEntry(updated, { entityType: "fechamento", entityId: fcData.id, action: "editar", userId: user.id, userName: user.name, changes: "Revisado pelo tesoureiro" });
    });
  };

  const handleAprovar = () => {
    if (!fechamento) return;
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = { ...d };
      updated.fechamentos = d.fechamentos.map((f) =>
        f.mesReferencia === selectedMes
          ? { ...f, status: "aprovado" as const, aprovadoPor: user.name, dataAprovacao: now.split("T")[0], bloqueado: true, updatedAt: now }
          : f
      );
      updated.financeiro = d.financeiro.map((f) =>
        f.mesReferencia === selectedMes ? { ...f, status: "aprovado" as const } : f
      );
      return addAuditEntry(updated, { entityType: "fechamento", entityId: fechamento.id, action: "aprovar", userId: user.id, userName: user.name });
    });
  };

  const meses = [...new Set(data.fechamentos.map((f) => f.mesReferencia))].sort().reverse();

  return (
    <div>
      <PageHeader title="Fechamento Mensal" subtitle="Revisão, aprovação e bloqueio de períodos" />

      <div className="flex gap-2 mb-6 flex-wrap">
        {meses.map((m) => (
          <Button key={m} variant={selectedMes === m ? "primary" : "secondary"} size="sm" onClick={() => setSelectedMes(m)}>
            {formatMesReferencia(m)}
          </Button>
        ))}
      </div>

      {isBloqueado && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <Lock size={20} />
          <span className="text-sm font-medium">Este mês está bloqueado para edição. Alterações exigem justificativa.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Vendas" value={formatCurrency(calculo.totalVendas ?? 0)} />
        <StatCard title="Total Pagamentos" value={formatCurrency(calculo.totalPagamentos ?? 0)} variant="success" />
        <StatCard title="Mensalidades" value={formatCurrency(calculo.totalMensalidades ?? 0)} />
        <StatCard title="Cotas" value={formatCurrency(calculo.totalCotas ?? 0)} />
        <StatCard title="Descontos" value={formatCurrency(calculo.totalDescontos ?? 0)} variant="warning" />
        <StatCard title="Saldo Cooperativa" value={formatCurrency(calculo.saldoCooperativa ?? 0)} variant="gold" />
      </div>

      <Card title="Status do Fechamento" className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={fechamento?.status ?? "rascunho"} />
            {fechamento?.revisadoPor && <span className="text-sm text-gray-500">Revisado por: {fechamento.revisadoPor}</span>}
            {fechamento?.aprovadoPor && <span className="text-sm text-gray-500">Aprovado por: {fechamento.aprovadoPor}</span>}
          </div>
          <div className="flex gap-2">
            {check("fechamento", "edit") && !isBloqueado && (
              <Button onClick={handleRevisar} variant="secondary"><FileCheck size={18} /> Revisar Dados</Button>
            )}
            {check("fechamento", "approve") && fechamento?.status === "revisado" && !isBloqueado && (
              <Button onClick={handleAprovar} variant="gold"><CheckCircle size={18} /> Aprovar Fechamento</Button>
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
            { key: "action", label: "Ação", render: (a) => <StatusBadge status={a.action === "aprovar" ? "aprovado" : "revisado"} /> },
            { key: "changes", label: "Detalhes", render: (a) => a.changes ?? a.justification ?? "-" },
          ]}
          emptyMessage="Nenhum registro de auditoria."
        />
      </Card>
    </div>
  );
}
