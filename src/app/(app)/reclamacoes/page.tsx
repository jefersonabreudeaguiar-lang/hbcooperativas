"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, DataTable, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { Card, StatCard } from "@/components/ui/Card";
import { updateData, addAuditEntry } from "@/services/dataStore";
import {
  criarReclamacao,
  removerReclamacao,
  listarReclamacoesCooperativa,
  getRelatorioReclamacoes,
} from "@/services/reclamacaoService";
import { formatDate } from "@/utils/format";

const FORM_VAZIO = () => ({
  cooperadoId: "",
  item: "",
  data: new Date().toISOString().split("T")[0],
  descricao: "",
});

export default function ReclamacoesPage() {
  const data = useAppData();
  const router = useRouter();
  const { user, check, isCooperado } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO());
  const [filtroCooperado, setFiltroCooperado] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (user && !check("reclamacoes", "view")) {
      router.replace("/dashboard");
    }
  }, [user, router, check]);

  useEffect(() => {
    if (isCooperado) router.replace("/dashboard");
  }, [isCooperado, router]);

  const cooperadosCoop = useMemo(() => {
    if (!data || !coopId) return [];
    return data.cooperados
      .filter((c) => c.cooperativaId === coopId && c.status !== "desligado")
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
  }, [data, coopId]);

  const resumo = useMemo(() => {
    if (!data) return { total: 0, historico: [], porCooperado: [] };
    return getRelatorioReclamacoes(data, coopId, filtroCooperado || undefined);
  }, [data, coopId, filtroCooperado]);

  const registrar = () => {
    if (!data || !user || !coopId) return;
    setErro("");

    if (!form.cooperadoId) {
      setErro("Selecione o cooperado.");
      return;
    }
    if (!form.item.trim()) {
      setErro("Informe o item relacionado à reclamação.");
      return;
    }
    if (!form.descricao.trim()) {
      setErro("Descreva a reclamação.");
      return;
    }

    updateData((d) => {
      const next = criarReclamacao(d, {
        cooperativaId: coopId,
        cooperadoId: form.cooperadoId,
        item: form.item.trim(),
        data: form.data,
        descricao: form.descricao.trim(),
        registradoPor: user.id,
        registradoPorNome: user.name,
      });
      return addAuditEntry(next, {
        entityType: "reclamacao",
        entityId: next.reclamacoes[next.reclamacoes.length - 1]?.id ?? "",
        action: "criar",
        userId: user.id,
        userName: user.name,
        changes: `Reclamação: ${form.item.trim()}`,
      });
    });

    setForm(FORM_VAZIO());
    setModalOpen(false);
  };

  const excluir = (id: string) => {
    if (!user || !check("reclamacoes", "delete")) return;
    if (!confirm("Remover esta reclamação do registro?")) return;
    updateData((d) => {
      const next = removerReclamacao(d, id);
      return addAuditEntry(next, {
        entityType: "reclamacao",
        entityId: id,
        action: "excluir",
        userId: user.id,
        userName: user.name,
        changes: "Reclamação removida",
      });
    });
  };

  if (!data || !user) return null;
  if (!check("reclamacoes", "view")) return null;

  return (
    <div>
      <PageHeader
        title="Registro de Reclamações"
        subtitle="Histórico de ocorrências por cooperado — gere o relatório em Relatórios"
        action={
          check("reclamacoes", "create") ? (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={16} className="mr-1" /> Registrar reclamação
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total de reclamações" value={String(resumo.total)} />
        <StatCard
          title="Cooperados com ocorrências"
          value={String(resumo.porCooperado.length)}
          variant="warning"
        />
        <StatCard
          title="Maior incidência"
          value={
            resumo.porCooperado[0]
              ? `${resumo.porCooperado[0].percentual}% · ${resumo.porCooperado[0].cooperadoNome}`
              : "—"
          }
        />
      </div>

      <Card className="mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <FormField label="Filtrar por cooperado">
            <Select
              value={filtroCooperado}
              onChange={(e) => setFiltroCooperado(e.target.value)}
              className="min-w-[220px]"
            >
              <option value="">Todos</option>
              {cooperadosCoop.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Card>

      {resumo.porCooperado.length > 0 && (
        <Card className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-3">
            Distribuição por cooperado (% do total)
          </h3>
          <div className="space-y-3">
            {resumo.porCooperado.map((p) => (
              <div key={p.cooperadoId}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-900">{p.cooperadoNome}</span>
                  <span className="text-gray-600 tabular-nums">
                    {p.quantidade} · {p.percentual.toLocaleString("pt-BR")}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${Math.min(100, p.percentual)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <DataTable
          data={resumo.historico}
          keyField="id"
          emptyMessage="Nenhuma reclamação registrada. Use o botão acima para registrar a primeira."
          columns={[
            { key: "data", label: "Data", render: (r) => formatDate(r.data) },
            { key: "cooperado", label: "Cooperado", render: (r) => r.cooperadoNome },
            { key: "item", label: "Item" },
            {
              key: "descricao",
              label: "Descrição",
              render: (r) => (
                <span className="line-clamp-2 max-w-md" title={r.descricao}>
                  {r.descricao}
                </span>
              ),
            },
            {
              key: "acoes",
              label: "",
              render: (r) =>
                check("reclamacoes", "delete") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => excluir(r.id)}
                    aria-label="Remover"
                  >
                    <Trash2 size={14} />
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setErro("");
        }}
        title="Registrar reclamação"
      >
        <div className="space-y-4">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <FormField label="Cooperado" required>
            <Select
              value={form.cooperadoId}
              onChange={(e) => setForm((f) => ({ ...f, cooperadoId: e.target.value }))}
            >
              <option value="">Selecione...</option>
              {cooperadosCoop.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Data" required>
            <Input
              type="date"
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
            />
          </FormField>
          <FormField label="Item" required>
            <Input
              value={form.item}
              onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))}
              placeholder="Ex.: Tomate, entrega, embalagem..."
            />
          </FormField>
          <FormField label="Descrição" required>
            <Textarea
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              rows={4}
              placeholder="Descreva o que ocorreu..."
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={registrar}>Registrar reclamação</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
