"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import { formatCurrency, formatDate } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { Cota } from "@/types";

export default function CotasPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Cota | null>(null);
  const [form, setForm] = useState<Partial<Cota>>({});

  const cotas = useMemo(() => {
    if (!data) return [];
    return data.cotas.filter((c) => {
      if (isCooperado && cooperadoId && c.cooperadoId !== cooperadoId) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [data, statusFilter, isCooperado, cooperadoId]);

  const openNew = () => {
    setEditing(null);
    setForm({ status: "em_aberto", quantidadeParcelas: 10, valorParcela: 50 });
    setModalOpen(true);
  };

  const openEdit = (c: Cota) => {
    setEditing(c);
    setForm({ ...c });
    setModalOpen(true);
  };

  const calcParcelas = (valorTotal: number, qtd: number) => {
    const parcela = Math.round((valorTotal / qtd) * 100) / 100;
    setForm((f) => ({ ...f, valorParcela: parcela, valorTotal, quantidadeParcelas: qtd }));
  };

  const handleSave = () => {
    if (!form.cooperadoId || !form.tipo || !user) return;
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = { ...d };
      const parcelasPendentes = (form.quantidadeParcelas ?? 0) - (form.parcelasPagas ?? 0);
      if (editing) {
        updated.cotas = d.cotas.map((c) =>
          c.id === editing.id ? { ...c, ...form, parcelasPendentes, updatedAt: now } as Cota : c
        );
        updated = addAuditEntry(updated, { entityType: "cota", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
      } else {
        const newC: Cota = {
          id: generateId("ct"),
          cooperadoId: form.cooperadoId!,
          tipo: form.tipo!,
          valorTotal: form.valorTotal ?? 500,
          quantidadeParcelas: form.quantidadeParcelas ?? 10,
          valorParcela: form.valorParcela ?? 50,
          parcelasPagas: 0,
          parcelasPendentes: form.quantidadeParcelas ?? 10,
          vencimento: form.vencimento ?? "",
          status: "em_aberto",
          historicoPagamentos: [],
          observacoes: form.observacoes,
          createdAt: now,
          updatedAt: now,
        };
        updated.cotas = [...d.cotas, newC];
        updated = addAuditEntry(updated, { entityType: "cota", entityId: newC.id, action: "criar", userId: user.id, userName: user.name });
      }
      return updated;
    });
    setModalOpen(false);
  };

  const handleDelete = (c: Cota) => {
    if (!confirm("Excluir esta cota?") || !user) return;
    updateData((d) => {
      let updated = { ...d, cotas: d.cotas.filter((x) => x.id !== c.id) };
      return addAuditEntry(updated, { entityType: "cota", entityId: c.id, action: "excluir", userId: user.id, userName: user.name });
    });
  };

  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Cotas da Cooperativa"
        subtitle="Controle de cotas sociais e de capital"
        action={check("cotas", "create") && (
          <Button onClick={openNew}><Plus size={18} /> Nova Cota</Button>
        )}
      />

      <FilterBar>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os status</option>
          <option value="quitada">Quitada</option>
          <option value="em_aberto">Em Aberto</option>
          <option value="parcelada">Parcelada</option>
          <option value="atrasada">Atrasada</option>
        </Select>
      </FilterBar>

      <DataTable
        data={cotas}
        keyField="id"
        columns={[
          { key: "cooperado", label: "Cooperado", render: (c) => getCooperadoNome(data.cooperados, c.cooperadoId) },
          { key: "tipo", label: "Tipo" },
          { key: "valorTotal", label: "Valor Total", render: (c) => formatCurrency(c.valorTotal) },
          { key: "parcelas", label: "Parcelas", render: (c) => `${c.parcelasPagas}/${c.quantidadeParcelas}` },
          { key: "valorParcela", label: "Valor Parcela", render: (c) => formatCurrency(c.valorParcela) },
          { key: "vencimento", label: "Vencimento", render: (c) => formatDate(c.vencimento) },
          { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
        ]}
        onEdit={check("cotas", "edit") ? openEdit : undefined}
        onDelete={check("cotas", "delete") ? handleDelete : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Cota" : "Nova Cota"} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isCooperado && (
            <FormField label="Cooperado" required>
              <Select value={form.cooperadoId ?? ""} onChange={(e) => setForm({ ...form, cooperadoId: e.target.value })}>
                <option value="">Selecione...</option>
                {data.cooperados.map((c) => <option key={c.id} value={c.id}>{c.nomeCompleto}</option>)}
              </Select>
            </FormField>
          )}
          <FormField label="Tipo da Cota" required><Input value={form.tipo ?? ""} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Cota Social, Cota de Capital..." /></FormField>
          <FormField label="Valor Total"><Input type="number" value={form.valorTotal ?? ""} onChange={(e) => calcParcelas(parseFloat(e.target.value), form.quantidadeParcelas ?? 10)} /></FormField>
          <FormField label="Quantidade de Parcelas"><Input type="number" value={form.quantidadeParcelas ?? ""} onChange={(e) => calcParcelas(form.valorTotal ?? 500, parseInt(e.target.value))} /></FormField>
          <FormField label="Valor da Parcela"><Input type="number" value={form.valorParcela ?? ""} readOnly className="bg-gray-50" /></FormField>
          <FormField label="Parcelas Pagas"><Input type="number" value={form.parcelasPagas ?? 0} onChange={(e) => setForm({ ...form, parcelasPagas: parseInt(e.target.value) })} /></FormField>
          <FormField label="Vencimento"><Input type="date" value={form.vencimento ?? ""} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></FormField>
          <FormField label="Status">
            <Select value={form.status ?? "em_aberto"} onChange={(e) => setForm({ ...form, status: e.target.value as Cota["status"] })}>
              <option value="em_aberto">Em Aberto</option>
              <option value="parcelada">Parcelada</option>
              <option value="quitada">Quitada</option>
              <option value="atrasada">Atrasada</option>
            </Select>
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Observações"><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></FormField>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
