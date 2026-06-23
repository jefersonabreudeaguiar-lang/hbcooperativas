"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart, UserCircle } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader, DataTable, FilterBar, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateData, generateId, addAuditEntry } from "@/services/dataStore";
import { formatCPFCNPJ, formatPhone } from "@/utils/format";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { pushCooperadoToCloud, syncCooperadosFromCloud } from "@/services/cooperadoCloudService";
import type { Cooperado, CooperadoStatus } from "@/types";

export default function CooperadosPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Cooperado | null>(null);
  const [form, setForm] = useState<Partial<Cooperado>>({});

  const cooperados = useMemo(() => {
    if (!data || !user) return [];
    const coopId = getUserCooperativaId(user, data);
    return data.cooperados.filter((c) => {
      if (coopId && c.cooperativaId !== coopId) return false;
      const matchSearch = !search || c.nomeCompleto.toLowerCase().includes(search.toLowerCase()) || c.cpfCnpj.includes(search);
      const matchStatus = !statusFilter || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter, user]);

  useEffect(() => {
    if (!data || !user) return;
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    const cnpj = normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
    if (cnpj.length === 14) void syncCooperadosFromCloud(cnpj);
  }, [data, user?.id]);

  const openNew = () => {
    setEditing(null);
    const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
    setForm({ status: "ativo", produtos: [], cooperativaId: coopId, avulso: false });
    setModalOpen(true);
  };

  const openEdit = (c: Cooperado) => {
    setEditing(c);
    setForm({ ...c, produtos: c.produtos });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.nomeCompleto || !user) return;
    if (!form.avulso && !form.cpfCnpj) return;
    const now = new Date().toISOString();
    const produtos = typeof form.produtos === "string" ? (form.produtos as string).split(",").map((p) => p.trim()) : form.produtos ?? [];
    let savedCooperado: Cooperado | null = null;

    updateData((d) => {
      let updated = { ...d };
      if (editing) {
        savedCooperado = { ...editing, ...form, produtos, updatedAt: now } as Cooperado;
        updated.cooperados = d.cooperados.map((c) =>
          c.id === editing.id ? savedCooperado! : c
        );
        updated = addAuditEntry(updated, { entityType: "cooperado", entityId: editing.id, action: "editar", userId: user.id, userName: user.name });
      } else {
        const coopId = form.cooperativaId ?? getUserCooperativaId(user, d);
        if (!coopId) return d;
        savedCooperado = {
          id: generateId("c"),
          cooperativaId: coopId,
          nomeCompleto: form.nomeCompleto!,
          cpfCnpj: form.cpfCnpj ?? "",
          telefone: form.telefone ?? "",
          endereco: form.endereco ?? "",
          comunidade: form.comunidade ?? "",
          cafDap: form.cafDap ?? "",
          chavePix: form.chavePix ?? "",
          banco: form.banco ?? "",
          agencia: form.agencia ?? "",
          conta: form.conta ?? "",
          status: (form.status as CooperadoStatus) ?? "ativo",
          avulso: form.avulso ?? false,
          membroDiretoria: form.membroDiretoria ?? false,
          produtos,
          observacoes: form.observacoes ?? "",
          createdAt: now,
          updatedAt: now,
        };
        updated.cooperados = [...d.cooperados, savedCooperado];
        updated = addAuditEntry(updated, { entityType: "cooperado", entityId: savedCooperado.id, action: "criar", userId: user.id, userName: user.name });
      }
      return updated;
    });

    if (savedCooperado && data && user) {
      const coopId = getUserCooperativaId(user, data);
      const coop = data.cooperativas.find((c) => c.id === coopId);
      const cnpj = normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
      if (cnpj.length === 14) void pushCooperadoToCloud(cnpj, savedCooperado);
    }

    setModalOpen(false);
  };

  const handleDelete = (c: Cooperado) => {
    if (!confirm(`Excluir cooperado ${c.nomeCompleto}?`) || !user) return;
    updateData((d) => {
      let updated = { ...d, cooperados: d.cooperados.filter((co) => co.id !== c.id) };
      return addAuditEntry(updated, { entityType: "cooperado", entityId: c.id, action: "excluir", userId: user.id, userName: user.name });
    });
  };

  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Cooperados"
        subtitle="Todos os cooperados cadastrados no CNPJ da cooperativa — abra a ficha para ver entregas e lançamentos"
        action={check("cooperados", "create") && (
          <Button onClick={openNew}><Plus size={18} /> Novo Cooperado</Button>
        )}
      />

      <FilterBar>
        <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="suspenso">Suspenso</option>
          <option value="desligado">Desligado</option>
        </Select>
      </FilterBar>

      <DataTable
        data={cooperados}
        keyField="id"
        columns={[
          { key: "nomeCompleto", label: "Nome", render: (c) => (
            <span>
              {c.nomeCompleto}
              {c.avulso ? <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Avulso</span> : null}
              {c.membroDiretoria ? <span className="ml-2 text-xs font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">Diretoria</span> : null}
            </span>
          ) },
          { key: "cpfCnpj", label: "CPF/CNPJ", render: (c) => (c.cpfCnpj ? formatCPFCNPJ(c.cpfCnpj) : "—") },
          { key: "comunidade", label: "Comunidade" },
          { key: "telefone", label: "Telefone", render: (c) => formatPhone(c.telefone) },
          { key: "pix", label: "PIX", render: (c) => c.chavePix || "—" },
          { key: "produtos", label: "Produtos", render: (c) => c.produtos.join(", ") },
          { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
          {
            key: "ficha",
            label: "Ficha",
            render: (c) => (
              <Link href={`/cooperados/${c.id}`} className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium">
                <UserCircle size={16} /> Ver ficha
              </Link>
            ),
          },
          {
            key: "venda",
            label: "Lançar",
            render: (c) =>
              check("notas_pedido", "create") ? (
                <Link href={`/notas-pedido?cooperado=${c.id}&lancar=1`} className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium">
                  <ShoppingCart size={16} /> Lançar nota
                </Link>
              ) : null,
          },
        ]}
        onView={(c) => router.push(`/cooperados/${c.id}`)}
        viewLabel="Ficha"
        onEdit={check("cooperados", "edit") ? openEdit : undefined}
        onDelete={check("cooperados", "delete") ? handleDelete : undefined}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Cooperado" : "Novo Cooperado"} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Nome Completo" required><Input value={form.nomeCompleto ?? ""} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} /></FormField>
          <FormField label="CPF ou CNPJ" required={!form.avulso} hint={form.avulso ? "Opcional para cooperado avulso" : undefined}>
            <Input value={form.cpfCnpj ?? ""} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} />
          </FormField>
          <FormField label="Telefone"><Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></FormField>
          <FormField label="Comunidade"><Input value={form.comunidade ?? ""} onChange={(e) => setForm({ ...form, comunidade: e.target.value })} /></FormField>
          <FormField label="Endereço"><Input value={form.endereco ?? ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></FormField>
          <FormField label="CAF/DAP"><Input value={form.cafDap ?? ""} onChange={(e) => setForm({ ...form, cafDap: e.target.value })} /></FormField>
          <FormField label="Chave PIX"><Input value={form.chavePix ?? ""} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} /></FormField>
          <FormField label="Banco"><Input value={form.banco ?? ""} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></FormField>
          <FormField label="Agência"><Input value={form.agencia ?? ""} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></FormField>
          <FormField label="Conta"><Input value={form.conta ?? ""} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></FormField>
          <FormField label="Status">
            <Select value={form.status ?? "ativo"} onChange={(e) => setForm({ ...form, status: e.target.value as CooperadoStatus })}>
              <option value="ativo">Ativo</option>
              <option value="suspenso">Suspenso</option>
              <option value="desligado">Desligado</option>
            </Select>
          </FormField>
          <FormField label="Produtos (separados por vírgula)"><Input value={Array.isArray(form.produtos) ? form.produtos.join(", ") : ""} onChange={(e) => setForm({ ...form, produtos: e.target.value.split(",").map((p) => p.trim()) })} /></FormField>
          <div className="md:col-span-2">
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={form.membroDiretoria ?? false}
                onChange={(e) => setForm({ ...form, membroDiretoria: e.target.checked })}
                className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Membro da diretoria</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Recebe avisos exclusivos da diretoria enviados pela cooperativa.
                </span>
              </span>
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={form.avulso ?? false}
                onChange={(e) => setForm({ ...form, avulso: e.target.checked })}
                className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Cooperado avulso</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Não usa o app. A cooperativa lança as entregas direto, sem foto de nota.
                </span>
              </span>
            </label>
          </div>
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
