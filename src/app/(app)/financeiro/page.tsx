"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { isDiretoriaRole } from "@/permissions";
import { PageHeader, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, FormField } from "@/components/ui/Form";
import { StatCard, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import { getFinanceiroResumoCooperado } from "@/services/dashboardService";
import { formatCurrency, formatDateTime, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { FinanceiroMensal } from "@/types";

export default function FinanceiroPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<FinanceiroMensal>>({});

  if (!data || !user) return null;

  const mes = getCurrentMesReferencia();
  const financeiro = data.financeiro.find((f) => f.mesReferencia === mes);
  const isAdmin = isDiretoriaRole(user.role);

  const openEdit = () => {
    setForm(financeiro ?? { mesReferencia: mes, saldoInicial: 0, entradas: 0, saidas: 0 });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!user) return;
    const now = new Date().toISOString();
    const saldoFinal = (form.saldoInicial ?? 0) + (form.entradas ?? 0) - (form.saidas ?? 0);
    updateData((d) => {
      let updated = { ...d };
      const finData: FinanceiroMensal = {
        id: financeiro?.id ?? generateId("f"),
        mesReferencia: mes,
        saldoInicial: form.saldoInicial ?? 0,
        entradas: form.entradas ?? 0,
        saidas: form.saidas ?? 0,
        saldoFinal,
        mensalidadesRecebidas: form.mensalidadesRecebidas ?? 0,
        cotasRecebidas: form.cotasRecebidas ?? 0,
        descontosRecebidos: form.descontosRecebidos ?? 0,
        pagamentosRealizados: form.pagamentosRealizados ?? 0,
        valoresPendentes: form.valoresPendentes ?? 0,
        observacoes: form.observacoes ?? "",
        dataAtualizacao: now,
        responsavel: user.name,
        status: financeiro?.status ?? "rascunho",
      };
      if (financeiro) {
        updated.financeiro = d.financeiro.map((f) => f.id === financeiro.id ? finData : f);
      } else {
        updated.financeiro = [...d.financeiro, finData];
      }
      return addAuditEntry(updated, { entityType: "financeiro", entityId: finData.id, action: "editar", userId: user.id, userName: user.name });
    });
    setModalOpen(false);
  };

  if (!isAdmin) {
    const resumo = getFinanceiroResumoCooperado(data);
    return (
      <div>
        <PageHeader title="Financeiro da Cooperativa" subtitle="Resumo geral — sem dados bancários sensíveis" />
        {resumo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard title="Saldo Informado" value={formatCurrency(resumo.saldoFinal)} variant="gold" />
            <StatCard title="Entradas do Mês" value={formatCurrency(resumo.entradas)} variant="success" />
            <StatCard title="Saídas do Mês" value={formatCurrency(resumo.saidas)} variant="warning" />
            <Card>
              <p className="text-sm text-gray-500">Última atualização</p>
              <p className="font-semibold mt-1">{formatDateTime(resumo.dataAtualizacao)}</p>
              <p className="text-sm text-green-700 mt-3">Situação geral da cooperativa disponível para consulta.</p>
            </Card>
          </div>
        ) : (
          <Card><p className="text-gray-500">Nenhum dado financeiro disponível para este mês.</p></Card>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Financeiro da Cooperativa"
        subtitle={formatMesReferencia(mes)}
        action={check("financeiro", "edit") && <Button onClick={openEdit}><Plus size={18} /> Atualizar Mês</Button>}
      />

      {financeiro ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard title="Saldo Inicial" value={formatCurrency(financeiro.saldoInicial)} />
            <StatCard title="Entradas" value={formatCurrency(financeiro.entradas)} variant="success" />
            <StatCard title="Saídas" value={formatCurrency(financeiro.saidas)} variant="warning" />
            <StatCard title="Saldo Final" value={formatCurrency(financeiro.saldoFinal)} variant="gold" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            <StatCard title="Mensalidades Recebidas" value={formatCurrency(financeiro.mensalidadesRecebidas)} />
            <StatCard title="Cotas Recebidas" value={formatCurrency(financeiro.cotasRecebidas)} />
            <StatCard title="Descontos Recebidos" value={formatCurrency(financeiro.descontosRecebidos)} />
            <StatCard title="Pagamentos Realizados" value={formatCurrency(financeiro.pagamentosRealizados)} />
            <StatCard title="Valores Pendentes" value={formatCurrency(financeiro.valoresPendentes)} variant="warning" />
          </div>
          <Card title="Detalhes">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Status:</span> <StatusBadge status={financeiro.status} /></div>
              <div className="flex justify-between"><span className="text-gray-500">Responsável:</span> <span>{financeiro.responsavel}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Atualização:</span> <span>{formatDateTime(financeiro.dataAtualizacao)}</span></div>
              {financeiro.observacoes && <p className="text-gray-600 mt-3 p-3 bg-gray-50 rounded-lg">{financeiro.observacoes}</p>}
            </div>
          </Card>
        </>
      ) : (
        <Card><p className="text-gray-500">Nenhum registro financeiro para {formatMesReferencia(mes)}. Clique em Atualizar Mês.</p></Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Atualizar Financeiro" size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Saldo Inicial"><Input type="number" step="0.01" value={form.saldoInicial ?? ""} onChange={(e) => setForm({ ...form, saldoInicial: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Entradas"><Input type="number" step="0.01" value={form.entradas ?? ""} onChange={(e) => setForm({ ...form, entradas: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Saídas"><Input type="number" step="0.01" value={form.saidas ?? ""} onChange={(e) => setForm({ ...form, saidas: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Mensalidades Recebidas"><Input type="number" step="0.01" value={form.mensalidadesRecebidas ?? ""} onChange={(e) => setForm({ ...form, mensalidadesRecebidas: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Cotas Recebidas"><Input type="number" step="0.01" value={form.cotasRecebidas ?? ""} onChange={(e) => setForm({ ...form, cotasRecebidas: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Descontos Recebidos"><Input type="number" step="0.01" value={form.descontosRecebidos ?? ""} onChange={(e) => setForm({ ...form, descontosRecebidos: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Pagamentos Realizados"><Input type="number" step="0.01" value={form.pagamentosRealizados ?? ""} onChange={(e) => setForm({ ...form, pagamentosRealizados: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Valores Pendentes"><Input type="number" step="0.01" value={form.valoresPendentes ?? ""} onChange={(e) => setForm({ ...form, valoresPendentes: parseFloat(e.target.value) })} /></FormField>
          <div className="md:col-span-2"><FormField label="Observações"><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></FormField></div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
