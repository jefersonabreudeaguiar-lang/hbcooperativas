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
import { formatCurrency, formatDate } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { Pagamento } from "@/types";

export default function PagamentosPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Pagamento | null>(null);
  const [form, setForm] = useState<Partial<Pagamento>>({});

  const pagamentos = useMemo(() => {
    if (!data) return [];
    return data.pagamentos.filter((p) => {
      if (isCooperado && cooperadoId && p.cooperadoId !== cooperadoId) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [data, statusFilter, isCooperado, cooperadoId]);

  const openEdit = (p: Pagamento) => {
    setEditing(p);
    setForm({ ...p });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!editing || !user) return;
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = { ...d };
      updated.pagamentos = d.pagamentos.map((p) =>
        p.id === editing.id ? { ...p, ...form, updatedAt: now } as Pagamento : p
      );
      if (form.status === "pago" && form.entregaId) {
        updated.entregas = d.entregas.map((e) =>
          e.id === form.entregaId ? { ...e, status: "pago" as const, updatedAt: now } : e
        );
      }
      return addAuditEntry(updated, { entityType: "pagamento", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
    });
    setModalOpen(false);
  };

  if (!data) return null;

  return (
    <div>
      <PageHeader title="Pagamentos aos Cooperados" subtitle="Controle de pagamentos por entrega" />

      <FilterBar>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="parcial">Parcial</option>
        </Select>
      </FilterBar>

      <DataTable
        data={pagamentos}
        keyField="id"
        columns={[
          { key: "cooperado", label: "Cooperado", render: (p) => getCooperadoNome(data.cooperados, p.cooperadoId) },
          { key: "entrega", label: "Entrega", render: (p) => { const e = data.entregas.find((x) => x.id === p.entregaId); return e ? `${e.produto} - ${formatDate(e.dataEntrega)}` : "-"; } },
          { key: "valorBruto", label: "Bruto", render: (p) => formatCurrency(p.valorBruto) },
          { key: "descontos", label: "Descontos", render: (p) => formatCurrency(p.descontos) },
          { key: "valorLiquido", label: "Líquido", render: (p) => formatCurrency(p.valorLiquido) },
          { key: "dataPrevista", label: "Previsto", render: (p) => formatDate(p.dataPrevista) },
          { key: "status", label: "Status", render: (p) => <StatusBadge status={p.status} /> },
        ]}
        onEdit={check("pagamentos", "edit") ? openEdit : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Atualizar Pagamento">
        <div className="space-y-4">
          <FormField label="Status">
            <Select value={form.status ?? ""} onChange={(e) => setForm({ ...form, status: e.target.value as Pagamento["status"] })}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="parcial">Parcial</option>
            </Select>
          </FormField>
          <FormField label="Data Efetiva"><Input type="date" value={form.dataEfetiva ?? ""} onChange={(e) => setForm({ ...form, dataEfetiva: e.target.value })} /></FormField>
          <FormField label="Forma de Pagamento"><Input value={form.formaPagamento ?? ""} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} /></FormField>
          <FormField label="Observação"><Input value={form.observacao ?? ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
