"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/Form";
import { updateData, generateId, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { TIPO_DESCONTO_LABELS } from "@/services/descontosService";
import { formatCurrency, formatDate } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { Desconto } from "@/types";

export default function DescontosPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [tipoFilter, setTipoFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<Desconto>>({});

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const pushOperacional = () => {
    void (async () => {
      if (!user || !coopId) return;
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId);
    })();
  };

  const descontos = useMemo(() => {
    if (!data) return [];
    return data.descontos.filter((d) => {
      if (isCooperado && cooperadoId && d.cooperadoId !== cooperadoId) return false;
      if (tipoFilter && d.tipo !== tipoFilter) return false;
      return true;
    });
  }, [data, tipoFilter, isCooperado, cooperadoId]);

  const openNew = () => {
    setForm({ tipo: "manual", data: new Date().toISOString().split("T")[0] });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.cooperadoId || !form.motivo || !user) return;
    const valorBruto = form.valorBruto ?? 0;
    const valorDescontado = form.valorDescontado ?? 0;
    updateData((d) => {
      const newD: Desconto = {
        id: generateId("d"),
        cooperadoId: form.cooperadoId!,
        entregaId: form.entregaId,
        tipo: form.tipo ?? "manual",
        motivo: form.motivo!,
        data: form.data ?? new Date().toISOString().split("T")[0],
        responsavel: user.name,
        valorBruto,
        valorDescontado,
        valorLiquido: valorBruto - valorDescontado,
        createdAt: new Date().toISOString(),
      };
      let updated = { ...d, descontos: [...d.descontos, newD] };
      return addAuditEntry(updated, { entityType: "desconto", entityId: newD.id, action: "criar", userId: user.id, userName: user.name });
    });
    pushOperacional();
    setModalOpen(false);
  };

  if (!data) return null;

  const columns = [
    { key: "data", label: "Data", render: (d: Desconto) => formatDate(d.data) },
    ...(!isCooperado
      ? [{ key: "cooperado", label: "Cooperado", render: (d: Desconto) => getCooperadoNome(data.cooperados, d.cooperadoId) }]
      : []),
    { key: "tipo", label: "Tipo", render: (d: Desconto) => TIPO_DESCONTO_LABELS[d.tipo] ?? d.tipo },
    { key: "motivo", label: "Motivo" },
    { key: "valorBruto", label: "Bruto", render: (d: Desconto) => formatCurrency(d.valorBruto) },
    { key: "valorDescontado", label: "Descontado", render: (d: Desconto) => formatCurrency(d.valorDescontado) },
    { key: "valorLiquido", label: "Líquido", render: (d: Desconto) => formatCurrency(d.valorLiquido) },
    { key: "responsavel", label: "Responsável" },
  ];

  return (
    <div>
      <PageHeader
        title={isCooperado ? "Meus descontos" : "Descontos da Cooperativa"}
        subtitle={
          isCooperado
            ? `Descontos lançados pela cooperativa · padrão ${data.config.descontoPadraoCooperativa}%`
            : `Desconto padrão: ${data.config.descontoPadraoCooperativa}%`
        }
        action={check("descontos", "create") && (
          <Button onClick={openNew}><Plus size={18} /> Desconto Manual</Button>
        )}
      />

      <FilterBar>
        <Select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} className="max-w-[220px]">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_DESCONTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </FilterBar>

      <DataTable data={descontos} keyField="id" columns={columns} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Desconto Manual">
        <div className="space-y-4">
          <FormField label="Cooperado" required>
            <Select value={form.cooperadoId ?? ""} onChange={(e) => setForm({ ...form, cooperadoId: e.target.value })}>
              <option value="">Selecione...</option>
              {data.cooperados.map((c) => <option key={c.id} value={c.id}>{c.nomeCompleto}</option>)}
            </Select>
          </FormField>
          <FormField label="Motivo" required><Input value={form.motivo ?? ""} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></FormField>
          <FormField label="Valor Bruto"><Input type="number" step="0.01" value={form.valorBruto ?? ""} onChange={(e) => setForm({ ...form, valorBruto: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Valor Descontado"><Input type="number" step="0.01" value={form.valorDescontado ?? ""} onChange={(e) => setForm({ ...form, valorDescontado: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Data"><Input type="date" value={form.data ?? ""} onChange={(e) => setForm({ ...form, data: e.target.value })} /></FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
