"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import { formatDate } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { Veiculo } from "@/types";

export default function VeiculosPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Veiculo | null>(null);
  const [form, setForm] = useState<Partial<Veiculo>>({});

  const veiculos = useMemo(() => {
    if (!data) return [];
    if (isCooperado && cooperadoId) return data.veiculos.filter((v) => v.cooperadoId === cooperadoId);
    return data.veiculos;
  }, [data, isCooperado, cooperadoId]);

  const openNew = () => { setEditing(null); setForm({ cooperadoId: cooperadoId ?? "", usadoParaEntrega: false }); setModalOpen(true); };
  const openEdit = (v: Veiculo) => { setEditing(v); setForm({ ...v }); setModalOpen(true); };

  const handleSave = () => {
    if (!form.modelo || !form.cooperadoId || !user) return;
    const now = new Date().toISOString();
    updateData((d) => {
      let updated = { ...d };
      if (editing) {
        updated.veiculos = d.veiculos.map((v) => v.id === editing.id ? { ...v, ...form, updatedAt: now } as Veiculo : v);
        updated = addAuditEntry(updated, { entityType: "veiculo", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
      } else {
        const newV: Veiculo = {
          id: generateId("v"), cooperadoId: form.cooperadoId!, tipo: form.tipo ?? "Outro",
          modelo: form.modelo!, placa: form.placa ?? "", usadoParaEntrega: form.usadoParaEntrega ?? false,
          documentacao: form.documentacao, validade: form.validade, observacoes: form.observacoes,
          createdAt: now, updatedAt: now,
        };
        updated.veiculos = [...d.veiculos, newV];
        updated = addAuditEntry(updated, { entityType: "veiculo", entityId: newV.id, action: "criar", userId: user.id, userName: user.name });
      }
      return updated;
    });
    setModalOpen(false);
  };

  const handleDelete = (v: Veiculo) => {
    if (!confirm("Excluir veículo?") || !user) return;
    updateData((d) => {
      let updated = { ...d, veiculos: d.veiculos.filter((x) => x.id !== v.id) };
      return addAuditEntry(updated, { entityType: "veiculo", entityId: v.id, action: "excluir", userId: user.id, userName: user.name });
    });
  };

  if (!data) return null;

  return (
    <div>
      <PageHeader title="Veículos" subtitle="Cadastro de veículos dos cooperados"
        action={check("veiculos", "create") && <Button onClick={openNew}><Plus size={18} /> Novo Veículo</Button>} />

      <DataTable
        data={veiculos}
        keyField="id"
        columns={[
          { key: "cooperado", label: "Proprietário", render: (v) => getCooperadoNome(data.cooperados, v.cooperadoId) },
          { key: "tipo", label: "Tipo" },
          { key: "modelo", label: "Modelo" },
          { key: "placa", label: "Placa" },
          { key: "entrega", label: "Entrega", render: (v) => v.usadoParaEntrega ? <StatusBadge status="ativo" /> : <span className="text-gray-400">Não</span> },
          { key: "validade", label: "Validade", render: (v) => v.validade ? formatDate(v.validade) : "-" },
        ]}
        onEdit={check("veiculos", "edit") ? openEdit : undefined}
        onDelete={check("veiculos", "delete") ? handleDelete : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Veículo" : "Novo Veículo"}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isCooperado && (
            <FormField label="Proprietário" required>
              <Select value={form.cooperadoId ?? ""} onChange={(e) => setForm({ ...form, cooperadoId: e.target.value })}>
                <option value="">Selecione...</option>
                {data.cooperados.map((c) => <option key={c.id} value={c.id}>{c.nomeCompleto}</option>)}
              </Select>
            </FormField>
          )}
          <FormField label="Tipo"><Input value={form.tipo ?? ""} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Caminhonete, Moto..." /></FormField>
          <FormField label="Modelo" required><Input value={form.modelo ?? ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></FormField>
          <FormField label="Placa"><Input value={form.placa ?? ""} onChange={(e) => setForm({ ...form, placa: e.target.value })} /></FormField>
          <FormField label="Validade Documentação"><Input type="date" value={form.validade ?? ""} onChange={(e) => setForm({ ...form, validade: e.target.value })} /></FormField>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={form.usadoParaEntrega ?? false} onChange={(e) => setForm({ ...form, usadoParaEntrega: e.target.checked })} className="rounded" />
            Usado para entrega
          </label>
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
