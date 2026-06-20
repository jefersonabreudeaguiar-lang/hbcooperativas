"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import { getCooperadoNome } from "@/utils/calculations";
import type { Propriedade } from "@/types";

export default function PropriedadesPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Propriedade | null>(null);
  const [form, setForm] = useState<Partial<Propriedade>>({});

  const propriedades = useMemo(() => {
    if (!data) return [];
    if (isCooperado && cooperadoId) return data.propriedades.filter((p) => p.cooperadoId === cooperadoId);
    return data.propriedades;
  }, [data, isCooperado, cooperadoId]);

  const openNew = () => { setEditing(null); setForm({ cooperadoId: cooperadoId ?? "" }); setModalOpen(true); };
  const openEdit = (p: Propriedade) => { setEditing(p); setForm({ ...p }); setModalOpen(true); };

  const handleSave = () => {
    if (!form.nome || !form.cooperadoId || !user) return;
    const now = new Date().toISOString();
    const produtos = typeof form.produtosProduzidos === "string"
      ? (form.produtosProduzidos as unknown as string).split(",").map((p) => p.trim())
      : form.produtosProduzidos ?? [];

    updateData((d) => {
      let updated = { ...d };
      if (editing) {
        updated.propriedades = d.propriedades.map((p) => p.id === editing.id ? { ...p, ...form, produtosProduzidos: produtos, updatedAt: now } as Propriedade : p);
        updated = addAuditEntry(updated, { entityType: "propriedade", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
      } else {
        const newP: Propriedade = {
          id: generateId("pr"), cooperadoId: form.cooperadoId!, nome: form.nome!,
          localizacao: form.localizacao ?? "", areaAproximada: form.areaAproximada ?? "",
          produtosProduzidos: produtos, observacoes: form.observacoes, createdAt: now, updatedAt: now,
        };
        updated.propriedades = [...d.propriedades, newP];
        updated = addAuditEntry(updated, { entityType: "propriedade", entityId: newP.id, action: "criar", userId: user.id, userName: user.name });
      }
      return updated;
    });
    setModalOpen(false);
  };

  const handleDelete = (p: Propriedade) => {
    if (!confirm("Excluir propriedade?") || !user) return;
    updateData((d) => {
      let updated = { ...d, propriedades: d.propriedades.filter((x) => x.id !== p.id) };
      return addAuditEntry(updated, { entityType: "propriedade", entityId: p.id, action: "excluir", userId: user.id, userName: user.name });
    });
  };

  if (!data) return null;

  return (
    <div>
      <PageHeader title="Propriedades" subtitle="Cadastro de propriedades dos cooperados"
        action={check("propriedades", "create") && <Button onClick={openNew}><Plus size={18} /> Nova Propriedade</Button>} />

      <DataTable
        data={propriedades}
        keyField="id"
        columns={[
          { key: "nome", label: "Nome" },
          { key: "cooperado", label: "Proprietário", render: (p) => getCooperadoNome(data.cooperados, p.cooperadoId) },
          { key: "localizacao", label: "Localização" },
          { key: "area", label: "Área", render: (p) => p.areaAproximada },
          { key: "produtos", label: "Produtos", render: (p) => p.produtosProduzidos.join(", ") },
        ]}
        onEdit={check("propriedades", "edit") ? openEdit : undefined}
        onDelete={check("propriedades", "delete") ? handleDelete : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Propriedade" : "Nova Propriedade"}>
        <div className="space-y-4">
          {!isCooperado && (
            <FormField label="Cooperado" required>
              <Select value={form.cooperadoId ?? ""} onChange={(e) => setForm({ ...form, cooperadoId: e.target.value })}>
                <option value="">Selecione...</option>
                {data.cooperados.map((c) => <option key={c.id} value={c.id}>{c.nomeCompleto}</option>)}
              </Select>
            </FormField>
          )}
          <FormField label="Nome da Propriedade" required><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></FormField>
          <FormField label="Localização"><Input value={form.localizacao ?? ""} onChange={(e) => setForm({ ...form, localizacao: e.target.value })} /></FormField>
          <FormField label="Área Aproximada"><Input value={form.areaAproximada ?? ""} onChange={(e) => setForm({ ...form, areaAproximada: e.target.value })} /></FormField>
          <FormField label="Produtos (vírgula)"><Input value={Array.isArray(form.produtosProduzidos) ? form.produtosProduzidos.join(", ") : ""} onChange={(e) => setForm({ ...form, produtosProduzidos: e.target.value.split(",").map((p) => p.trim()) })} /></FormField>
          <FormField label="Observações"><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
