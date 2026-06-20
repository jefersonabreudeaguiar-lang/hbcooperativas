"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import { formatCurrency, formatDate } from "@/utils/format";
import { calcularEntrega, calcularDescontosAutomaticos, getCooperadoNome } from "@/utils/calculations";
import type { Entrega, EntregaStatus } from "@/types";

export default function EntregasPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const [statusFilter, setStatusFilter] = useState("");
  const [instFilter, setInstFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entrega | null>(null);
  const [form, setForm] = useState<Partial<Entrega>>({});
  const [preview, setPreview] = useState({ bruto: 0, desconto: 0, adicionais: 0, liquido: 0 });

  const entregas = useMemo(() => {
    if (!data) return [];
    return data.entregas.filter((e) => {
      if (isCooperado && cooperadoId && e.cooperadoId !== cooperadoId) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (instFilter && e.instituicaoId !== instFilter) return false;
      return true;
    });
  }, [data, statusFilter, instFilter, isCooperado, cooperadoId]);

  useEffect(() => {
    if (!data || !form.quantidade || !form.valorUnitario) return;
    const percentual = form.percentualDescontoCooperativa ?? data.config.descontoPadraoCooperativa;
    let adicionais = 0;
    if (form.cooperadoId && check("descontos", "create")) {
      const calc = calcularDescontosAutomaticos(form.cooperadoId, form.quantidade * form.valorUnitario, data, percentual);
      adicionais = calc.descontoMensalidade + calc.descontoCota;
    }
    const result = calcularEntrega(form.quantidade, form.valorUnitario, percentual, adicionais);
    setPreview({
      bruto: result.valorBruto,
      desconto: result.valorDescontoCooperativa,
      adicionais: result.descontosAdicionais,
      liquido: result.valorLiquido,
    });
  }, [form.quantidade, form.valorUnitario, form.cooperadoId, form.percentualDescontoCooperativa, data, check]);

  const openNew = () => {
    setEditing(null);
    setForm({
      status: "pendente",
      percentualDescontoCooperativa: data?.config.descontoPadraoCooperativa ?? 5,
      quantidade: 0,
      valorUnitario: 0,
    });
    setModalOpen(true);
  };

  const openEdit = (e: Entrega) => {
    setEditing(e);
    setForm({ ...e });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.cooperadoId || !form.instituicaoId || !form.produto || !user || !data) return;
    const now = new Date().toISOString();
    const percentual = form.percentualDescontoCooperativa ?? data.config.descontoPadraoCooperativa;
    const calcAuto = calcularDescontosAutomaticos(form.cooperadoId, (form.quantidade ?? 0) * (form.valorUnitario ?? 0), data, percentual);
    const adicionais = calcAuto.descontoMensalidade + calcAuto.descontoCota;
    const valores = calcularEntrega(form.quantidade ?? 0, form.valorUnitario ?? 0, percentual, adicionais);

    updateData((d) => {
      let updated = { ...d };
      const entregaData: Entrega = {
        id: editing?.id ?? generateId("e"),
        instituicaoId: form.instituicaoId!,
        cooperadoId: form.cooperadoId!,
        produto: form.produto!,
        quantidade: form.quantidade ?? 0,
        unidade: form.unidade ?? "kg",
        valorUnitario: form.valorUnitario ?? 0,
        ...valores,
        percentualDescontoCooperativa: percentual,
        dataEntrega: form.dataEntrega ?? now.split("T")[0],
        localEntrega: form.localEntrega ?? "",
        status: (form.status as EntregaStatus) ?? "pendente",
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };

      if (editing) {
        updated.entregas = d.entregas.map((e) => (e.id === editing.id ? entregaData : e));
        updated = addAuditEntry(updated, { entityType: "entrega", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
      } else {
        updated.entregas = [...d.entregas, entregaData];
        updated = addAuditEntry(updated, { entityType: "entrega", entityId: entregaData.id, action: "criar", userId: user.id, userName: user.name });

        const pagamento = {
          id: generateId("p"),
          cooperadoId: entregaData.cooperadoId,
          entregaId: entregaData.id,
          valorBruto: entregaData.valorBruto,
          descontos: entregaData.valorDescontoCooperativa + entregaData.descontosAdicionais,
          valorLiquido: entregaData.valorLiquido,
          status: "pendente" as const,
          dataPrevista: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
          createdAt: now,
          updatedAt: now,
        };
        updated.pagamentos = [...d.pagamentos, pagamento];
      }
      return updated;
    });
    setModalOpen(false);
  };

  const handleDelete = (e: Entrega) => {
    if (!confirm("Excluir esta entrega?") || !user) return;
    updateData((d) => {
      let updated = { ...d, entregas: d.entregas.filter((x) => x.id !== e.id), pagamentos: d.pagamentos.filter((p) => p.entregaId !== e.id) };
      return addAuditEntry(updated, { entityType: "entrega", entityId: e.id, action: "excluir", userId: user.id, userName: user.name });
    });
  };

  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Entregas e Vendas"
        subtitle="Cadastro de entregas para PNAE e outras instituições"
        action={check("entregas", "create") && (
          <Button onClick={openNew}><Plus size={18} /> Nova Entrega</Button>
        )}
      />

      <FilterBar>
        <Select value={instFilter} onChange={(e) => setInstFilter(e.target.value)} className="max-w-[250px]">
          <option value="">Todas as instituições</option>
          {data.instituicoes.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="entregue">Entregue</option>
          <option value="conferido">Conferido</option>
          <option value="pago">Pago</option>
          <option value="cancelado">Cancelado</option>
        </Select>
      </FilterBar>

      <DataTable
        data={entregas}
        keyField="id"
        columns={[
          { key: "data", label: "Data", render: (e) => formatDate(e.dataEntrega) },
          { key: "cooperado", label: "Cooperado", render: (e) => getCooperadoNome(data.cooperados, e.cooperadoId) },
          { key: "produto", label: "Produto", render: (e) => `${e.produto} (${e.quantidade} ${e.unidade})` },
          { key: "instituicao", label: "Instituição", render: (e) => data.instituicoes.find((i) => i.id === e.instituicaoId)?.nome ?? "-" },
          { key: "valorBruto", label: "Bruto", render: (e) => formatCurrency(e.valorBruto) },
          { key: "valorLiquido", label: "Líquido", render: (e) => formatCurrency(e.valorLiquido) },
          { key: "status", label: "Status", render: (e) => <StatusBadge status={e.status} /> },
        ]}
        onEdit={check("entregas", "edit") ? openEdit : undefined}
        onDelete={check("entregas", "delete") ? handleDelete : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Entrega" : "Nova Entrega"} size="xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <FormField label="Instituição" required>
            <Select value={form.instituicaoId ?? ""} onChange={(e) => setForm({ ...form, instituicaoId: e.target.value })}>
              <option value="">Selecione...</option>
              {data.instituicoes.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Produto" required><Input value={form.produto ?? ""} onChange={(e) => setForm({ ...form, produto: e.target.value })} /></FormField>
          <FormField label="Quantidade" required><Input type="number" value={form.quantidade ?? ""} onChange={(e) => setForm({ ...form, quantidade: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Unidade"><Input value={form.unidade ?? "kg"} onChange={(e) => setForm({ ...form, unidade: e.target.value })} /></FormField>
          <FormField label="Valor Unitário" required><Input type="number" step="0.01" value={form.valorUnitario ?? ""} onChange={(e) => setForm({ ...form, valorUnitario: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Desconto Cooperativa (%)"><Input type="number" value={form.percentualDescontoCooperativa ?? data.config.descontoPadraoCooperativa} onChange={(e) => setForm({ ...form, percentualDescontoCooperativa: parseFloat(e.target.value) })} /></FormField>
          <FormField label="Data da Entrega"><Input type="date" value={form.dataEntrega ?? ""} onChange={(e) => setForm({ ...form, dataEntrega: e.target.value })} /></FormField>
          <FormField label="Local de Entrega"><Input value={form.localEntrega ?? ""} onChange={(e) => setForm({ ...form, localEntrega: e.target.value })} /></FormField>
          <FormField label="Status">
            <Select value={form.status ?? "pendente"} onChange={(e) => setForm({ ...form, status: e.target.value as EntregaStatus })}>
              <option value="pendente">Pendente</option>
              <option value="entregue">Entregue</option>
              <option value="conferido">Conferido</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </Select>
          </FormField>
        </div>

        <Card className="mt-4 bg-green-50 border-green-200" title="Cálculo Automático">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">Valor Bruto:</span> <strong>{formatCurrency(preview.bruto)}</strong></div>
            <div><span className="text-gray-500">Desc. Cooperativa:</span> <strong className="text-red-600">-{formatCurrency(preview.desconto)}</strong></div>
            <div><span className="text-gray-500">Desc. Adicionais:</span> <strong className="text-red-600">-{formatCurrency(preview.adicionais)}</strong></div>
            <div><span className="text-gray-500">Valor Líquido:</span> <strong className="text-green-700">{formatCurrency(preview.liquido)}</strong></div>
          </div>
        </Card>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}
