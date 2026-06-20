"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { Mensalidade } from "@/types";

export default function MensalidadesPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [statusFilter, setStatusFilter] = useState("");
  const [mesFilter, setMesFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Mensalidade | null>(null);
  const [form, setForm] = useState<Partial<Mensalidade>>({});

  const mensalidades = useMemo(() => {
    if (!data) return [];
    return data.mensalidades.filter((m) => {
      if (isCooperado && cooperadoId && m.cooperadoId !== cooperadoId) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (mesFilter && m.mesReferencia !== mesFilter) return false;
      return true;
    });
  }, [data, statusFilter, mesFilter, isCooperado, cooperadoId]);

  const meses = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.mensalidades.map((m) => m.mesReferencia))].sort().reverse();
  }, [data]);

  const openNew = () => {
    setEditing(null);
    setForm({ status: "pendente", valor: 50 });
    setModalOpen(true);
  };

  const openEdit = (m: Mensalidade) => {
    setEditing(m);
    setForm({ ...m });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.cooperadoId || !form.mesReferencia || !user) return;
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = { ...d };
      if (editing) {
        updated.mensalidades = d.mensalidades.map((m) =>
          m.id === editing.id ? { ...m, ...form, updatedAt: now } as Mensalidade : m
        );
        updated = addAuditEntry(updated, { entityType: "mensalidade", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
      } else {
        const newM: Mensalidade = {
          id: generateId("m"),
          cooperadoId: form.cooperadoId!,
          mesReferencia: form.mesReferencia!,
          valor: form.valor ?? 50,
          vencimento: form.vencimento ?? "",
          status: form.status ?? "pendente",
          dataPagamento: form.dataPagamento,
          formaPagamento: form.formaPagamento,
          observacao: form.observacao,
          createdAt: now,
          updatedAt: now,
        };
        updated.mensalidades = [...d.mensalidades, newM];
        updated = addAuditEntry(updated, { entityType: "mensalidade", entityId: newM.id, action: "criar", userId: user.id, userName: user.name });
      }
      return updated;
    });
    setModalOpen(false);
  };

  const handleDelete = (m: Mensalidade) => {
    if (!confirm("Excluir esta mensalidade?") || !user) return;
    updateData((d) => {
      let updated = { ...d, mensalidades: d.mensalidades.filter((x) => x.id !== m.id) };
      return addAuditEntry(updated, { entityType: "mensalidade", entityId: m.id, action: "excluir", userId: user.id, userName: user.name });
    });
  };

  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Mensalidades"
        subtitle="Controle mensal de mensalidades dos cooperados"
        action={check("mensalidades", "create") && (
          <Button onClick={openNew}><Plus size={18} /> Nova Mensalidade</Button>
        )}
      />

      <FilterBar>
        <Select value={mesFilter} onChange={(e) => setMesFilter(e.target.value)} className="max-w-[200px]">
          <option value="">Todos os meses</option>
          {meses.map((m) => <option key={m} value={m}>{formatMesReferencia(m)}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os status</option>
          <option value="paga">Paga</option>
          <option value="pendente">Pendente</option>
          <option value="atrasada">Atrasada</option>
          <option value="parcelada">Parcelada</option>
        </Select>
      </FilterBar>

      <DataTable
        data={mensalidades}
        keyField="id"
        columns={[
          { key: "cooperado", label: "Cooperado", render: (m) => getCooperadoNome(data.cooperados, m.cooperadoId) },
          { key: "mesReferencia", label: "Mês", render: (m) => formatMesReferencia(m.mesReferencia) },
          { key: "valor", label: "Valor", render: (m) => formatCurrency(m.valor) },
          { key: "vencimento", label: "Vencimento", render: (m) => formatDate(m.vencimento) },
          { key: "status", label: "Status", render: (m) => <StatusBadge status={m.status} /> },
          { key: "dataPagamento", label: "Pagamento", render: (m) => m.dataPagamento ? formatDate(m.dataPagamento) : "-" },
        ]}
        onEdit={check("mensalidades", "edit") ? openEdit : undefined}
        onDelete={check("mensalidades", "delete") ? handleDelete : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Mensalidade" : "Nova Mensalidade"}>
        <div className="space-y-4">
          {!isCooperado && (
            <FormField label="Cooperado" required>
              <Select value={form.cooperadoId ?? ""} onChange={(e) => setForm({ ...form, cooperadoId: e.target.value })}>
                <option value="">Selecione...</option>
                {data.cooperados.filter((c) => c.status === "ativo").map((c) => (
                  <option key={c.id} value={c.id}>{c.nomeCompleto}</option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Mês de Referência" required><Input type="month" value={form.mesReferencia ?? ""} onChange={(e) => setForm({ ...form, mesReferencia: e.target.value })} /></FormField>
          <FormField label="Valor" required><Input type="number" step="0.01" value={form.valor ?? ""} onChange={(e) => setForm({ ...form, valor: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Vencimento"><Input type="date" value={form.vencimento ?? ""} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} /></FormField>
          <FormField label="Status">
            <Select value={form.status ?? "pendente"} onChange={(e) => setForm({ ...form, status: e.target.value as Mensalidade["status"] })}>
              <option value="pendente">Pendente</option>
              <option value="paga">Paga</option>
              <option value="atrasada">Atrasada</option>
              <option value="parcelada">Parcelada</option>
            </Select>
          </FormField>
          <FormField label="Data Pagamento"><Input type="date" value={form.dataPagamento ?? ""} onChange={(e) => setForm({ ...form, dataPagamento: e.target.value })} /></FormField>
          <FormField label="Forma de Pagamento"><Input value={form.formaPagamento ?? ""} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} /></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
