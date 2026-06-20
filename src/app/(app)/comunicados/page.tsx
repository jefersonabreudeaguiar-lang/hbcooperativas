"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, Pin, Repeat, Pause, Play, Trash2, RefreshCw, Send, Pencil } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData, generateId, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud, syncAllCooperativaFromCloud } from "@/services/cooperativaSyncCloudService";
import { getComunicadosParaExibicao } from "@/services/comunicadoService";
import { formatDate } from "@/utils/format";
import type { Comunicado, ComunicadoCategoria } from "@/types";

const CATEGORIA_LABELS: Record<ComunicadoCategoria, string> = {
  financeiro: "Financeiro",
  reuniao: "Reunião",
  entrega: "Entrega",
  documentacao: "Documentação",
  aviso_geral: "Aviso Geral",
};

const FORM_VAZIO = (): Partial<Comunicado> => ({
  categoria: "aviso_geral",
  fixado: false,
  visivelParaTodos: true,
  recorrente: false,
  diaDoMes: 1,
  ativo: true,
  data: new Date().toISOString().split("T")[0],
  titulo: "",
  descricao: "",
});

export default function ComunicadosPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<Comunicado>>(FORM_VAZIO());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alteracoesPendentes, setAlteracoesPendentes] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [msgPublicacao, setMsgPublicacao] = useState("");

  useEffect(() => {
    if (!data || !coopId || !user) return;
    void (async () => {
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      if (cnpj) await syncAllCooperativaFromCloud(cnpj);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coopId, user?.id]);

  const comunicadosExibicao = useMemo(() => {
    if (!data) return [];
    return getComunicadosParaExibicao(data, coopId, { incluirInativos: check("comunicados", "create") }).filter(
      (c) => !categoriaFilter || c.categoria === categoriaFilter
    );
  }, [data, coopId, categoriaFilter, check]);

  const templatesRecorrentes = useMemo(() => {
    if (!data || !coopId) return [];
    return data.comunicados.filter(
      (c) => c.recorrente && (!c.cooperativaId || c.cooperativaId === coopId)
    );
  }, [data, coopId]);

  const marcarPendente = () => setAlteracoesPendentes(true);

  const limparFormulario = () => {
    setForm(FORM_VAZIO());
    setEditingId(null);
  };

  const openEdit = (c: Comunicado) => {
    setEditingId(c.id);
    setForm({
      titulo: c.titulo,
      descricao: c.descricao,
      data: c.data,
      categoria: c.categoria,
      fixado: c.fixado,
      visivelParaTodos: c.visivelParaTodos,
      recorrente: c.recorrente ?? false,
      diaDoMes: c.diaDoMes ?? 1,
      ativo: c.ativo !== false,
    });
    setModalOpen(true);
  };

  const salvarComunicado = () => {
    if (!form.titulo?.trim() || !form.descricao?.trim() || !user || !coopId) return;

    updateData((d) => {
      if (editingId) {
        const updated = {
          ...d,
          comunicados: d.comunicados.map((x) =>
            x.id === editingId
              ? {
                  ...x,
                  titulo: form.titulo!.trim(),
                  descricao: form.descricao!.trim(),
                  data: form.data ?? x.data,
                  categoria: (form.categoria as ComunicadoCategoria) ?? "aviso_geral",
                  fixado: form.fixado ?? false,
                  visivelParaTodos: form.visivelParaTodos ?? true,
                  recorrente: form.recorrente ?? false,
                  diaDoMes: form.recorrente ? Math.min(28, Math.max(1, form.diaDoMes ?? 1)) : undefined,
                  ativo: form.ativo !== false,
                }
              : x
          ),
        };
        return addAuditEntry(updated, {
          entityType: "comunicado",
          entityId: editingId,
          action: "editar",
          userId: user.id,
          userName: user.name,
        });
      }

      const newC: Comunicado = {
        id: generateId("cm"),
        cooperativaId: coopId,
        titulo: form.titulo!.trim(),
        descricao: form.descricao!.trim(),
        data: form.data ?? new Date().toISOString().split("T")[0],
        responsavel: user.name,
        categoria: (form.categoria as ComunicadoCategoria) ?? "aviso_geral",
        fixado: form.fixado ?? false,
        visivelParaTodos: form.visivelParaTodos ?? true,
        recorrente: form.recorrente ?? false,
        diaDoMes: form.recorrente ? Math.min(28, Math.max(1, form.diaDoMes ?? 1)) : undefined,
        ativo: true,
        createdAt: new Date().toISOString(),
      };
      const updated = { ...d, comunicados: [newC, ...d.comunicados] };
      return addAuditEntry(updated, {
        entityType: "comunicado",
        entityId: newC.id,
        action: "criar",
        userId: user.id,
        userName: user.name,
      });
    });

    marcarPendente();
    setModalOpen(false);
    limparFormulario();
  };

  const toggleAtivo = (c: Comunicado) => {
    if (!user) return;
    updateData((d) => ({
      ...d,
      comunicados: d.comunicados.map((x) =>
        x.id === c.id ? { ...x, ativo: x.ativo === false ? true : false } : x
      ),
    }));
    marcarPendente();
  };

  const handleDelete = (c: Comunicado) => {
    if (!user || !confirm(`Remover o aviso "${c.titulo}"?`)) return;
    updateData((d) => ({
      ...d,
      comunicados: d.comunicados.filter((x) => x.id !== c.id),
    }));
    marcarPendente();
  };

  const handlePublicar = async () => {
    if (!user || !coopId) return;
    setPublicando(true);
    setMsgPublicacao("");
    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (!cnpj) {
        setMsgPublicacao("CNPJ da cooperativa não encontrado.");
        return;
      }
      await pushOperacionalToCloud(cnpj, d, coopId);
      setAlteracoesPendentes(false);
      setMsgPublicacao("Avisos enviados! Os cooperados verão na aba Avisos.");
    } catch {
      setMsgPublicacao("Não foi possível enviar. Verifique a internet e tente de novo.");
    } finally {
      setPublicando(false);
    }
  };

  if (!data) return null;

  const canManage = check("comunicados", "create");
  const formValido = Boolean(form.titulo?.trim() && form.descricao?.trim());

  const FormularioComunicado = ({ idPrefix = "" }: { idPrefix?: string }) => (
    <div className="space-y-4">
      <FormField label="Título do aviso" required>
        <Input
          id={`${idPrefix}titulo`}
          value={form.titulo ?? ""}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          placeholder="Ex: Reunião geral, prazo de entrega..."
        />
      </FormField>
      <FormField label="Texto do aviso" required hint="Digite a mensagem que os cooperados devem ler">
        <Textarea
          id={`${idPrefix}descricao`}
          value={form.descricao ?? ""}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          rows={6}
          placeholder="Escreva aqui o comunicado completo para os cooperados..."
          className="min-h-[140px] text-base leading-relaxed"
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Categoria">
          <Select
            value={form.categoria ?? "aviso_geral"}
            onChange={(e) => setForm({ ...form, categoria: e.target.value as ComunicadoCategoria })}
          >
            {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </FormField>
        {!form.recorrente && (
          <FormField label="Data">
            <Input type="date" value={form.data ?? ""} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </FormField>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.fixado ?? false} onChange={(e) => setForm({ ...form, fixado: e.target.checked })} className="rounded" />
          Fixar no topo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.recorrente ?? false} onChange={(e) => setForm({ ...form, recorrente: e.target.checked })} className="rounded" />
          Repetir automaticamente todo mês
        </label>
      </div>
      {form.recorrente && (
        <FormField label="A partir de qual dia do mês?" hint="O aviso aparece todo mês a partir deste dia">
          <Input
            type="number"
            min={1}
            max={28}
            value={form.diaDoMes ?? 1}
            onChange={(e) => setForm({ ...form, diaDoMes: parseInt(e.target.value, 10) || 1 })}
          />
        </FormField>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Comunicados"
        subtitle={
          canManage
            ? "Digite os avisos e envie quando estiver pronto — os cooperados recebem na aba Avisos"
            : "Avisos da cooperativa"
        }
        action={
          canManage && (
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => void handlePublicar()}
                disabled={publicando || !alteracoesPendentes}
              >
                <RefreshCw size={18} className={publicando ? "animate-spin" : ""} />
                {publicando ? "Enviando…" : "Enviar aos cooperados"}
              </Button>
            </div>
          )
        }
      />

      {msgPublicacao && (
        <AlertBanner
          variant={msgPublicacao.includes("enviados") ? "success" : "error"}
          className="mb-4"
          onDismiss={() => setMsgPublicacao("")}
        >
          {msgPublicacao}
        </AlertBanner>
      )}

      {canManage && alteracoesPendentes && (
        <AlertBanner variant="warning" title="Avisos ainda não enviados" className="mb-4">
          Você salvou alterações localmente. Toque em <strong>Enviar aos cooperados</strong> para publicar na nuvem.
        </AlertBanner>
      )}

      {canManage && (
        <Card title="Escrever aviso" className="mb-6">
          <FormularioComunicado idPrefix="inline-" />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={limparFormulario} disabled={!form.titulo && !form.descricao}>
              Limpar
            </Button>
            <Button onClick={salvarComunicado} disabled={!formValido}>
              <Plus size={18} /> Salvar aviso
            </Button>
          </div>
        </Card>
      )}

      {canManage && (
        <AlertBanner variant="info" title="Lembrete de mensalidade automático" className="mb-4">
          Configure valor, vencimento e aviso mensal em{" "}
          <a href="/meu-perfil" className="font-semibold underline">Perfil da cooperativa</a>
          {" "}— os cooperados verão o lembrete todo mês sem você publicar de novo.
        </AlertBanner>
      )}

      {canManage && templatesRecorrentes.length > 0 && (
        <Card title="Lembretes mensais cadastrados" className="mb-6">
          <ul className="divide-y divide-gray-100">
            {templatesRecorrentes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{c.titulo}</p>
                  <p className="text-xs text-gray-500">
                    Dia {c.diaDoMes ?? 1} · {c.ativo === false ? "Pausado" : "Ativo"}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Editar">
                    <Pencil size={16} />
                  </button>
                  <button type="button" onClick={() => toggleAtivo(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title={c.ativo === false ? "Ativar" : "Pausar"}>
                    {c.ativo === false ? <Play size={16} /> : <Pause size={16} />}
                  </button>
                  <button type="button" onClick={() => handleDelete(c)} className="p-2 rounded-lg hover:bg-red-50 text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        <Button variant={!categoriaFilter ? "primary" : "secondary"} size="sm" onClick={() => setCategoriaFilter("")}>Todos</Button>
        {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
          <Button key={k} variant={categoriaFilter === k ? "primary" : "secondary"} size="sm" onClick={() => setCategoriaFilter(k)}>{v}</Button>
        ))}
      </div>

      <div className="space-y-4">
        {comunicadosExibicao.map((c) => (
          <Card key={c.id} className={c.fixado ? "border-amber-300 bg-amber-50/30" : ""}>
            <div className="flex items-start gap-3">
              {c.fixado && <Pin size={18} className="text-amber-500 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{c.titulo}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{CATEGORIA_LABELS[c.categoria]}</span>
                  {(c.recorrente || c.virtual) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                      <Repeat size={12} /> {c.recorrenteLabel ?? "Mensal"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">{c.descricao}</p>
                <p className="text-xs text-gray-400 mt-3">{formatDate(c.data)} — {c.responsavel}</p>
              </div>
              {canManage && !c.virtual && (
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Editar">
                    <Pencil size={16} />
                  </button>
                  {!c.recorrente && (
                    <button type="button" onClick={() => handleDelete(c)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Excluir">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
        {comunicadosExibicao.length === 0 && (
          <Card><p className="text-gray-500 text-center py-8">Nenhum aviso publicado ainda.</p></Card>
        )}
      </div>

      {canManage && alteracoesPendentes && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 z-30">
          <Button size="lg" className="shadow-lg" onClick={() => void handlePublicar()} disabled={publicando}>
            <Send size={18} />
            {publicando ? "Enviando…" : "Enviar aos cooperados"}
          </Button>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); limparFormulario(); }}
        title={editingId ? "Editar aviso" : "Novo aviso"}
      >
        <FormularioComunicado idPrefix="modal-" />
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => { setModalOpen(false); limparFormulario(); }}>Cancelar</Button>
          <Button onClick={salvarComunicado} disabled={!formValido}>
            {editingId ? "Salvar alterações" : "Salvar aviso"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
