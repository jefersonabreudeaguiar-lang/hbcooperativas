"use client";

import { useState, useMemo } from "react";
import { Plus, Repeat, Pause, Play, Trash2, RefreshCw, Send, Pencil } from "lucide-react";
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
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { getComunicadosParaExibicao, getComunicadosCooperado, cooperadoTemConteudoComunicado } from "@/services/comunicadoService";
import { AudioRecorder } from "@/components/comunicado/AudioRecorder";
import { ComunicadoCard } from "@/components/comunicado/ComunicadoCard";
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
  somenteDiretoria: false,
  recorrente: false,
  diaDoMes: 1,
  ativo: true,
  data: new Date().toISOString().split("T")[0],
  assunto: "",
  titulo: "",
  descricao: "",
  audioDataUrl: undefined,
});

export default function ComunicadosPage() {
  const data = useAppData();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<Comunicado>>(FORM_VAZIO());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alteracoesPendentes, setAlteracoesPendentes] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [msgPublicacao, setMsgPublicacao] = useState("");

  const comunicadosExibicao = useMemo(() => {
    if (!data || !coopId) return [];
    const base = isCooperado
      ? getComunicadosCooperado(data, coopId, cooperadoId ?? user?.cooperadoId)
      : getComunicadosParaExibicao(data, coopId, { incluirInativos: check("comunicados", "create") });
    return base.filter((c) => !categoriaFilter || c.categoria === categoriaFilter);
  }, [data, coopId, categoriaFilter, check, isCooperado, cooperadoId, user?.cooperadoId]);

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
      assunto: c.assunto ?? c.titulo,
      titulo: c.titulo,
      descricao: c.descricao,
      audioDataUrl: c.audioDataUrl,
      data: c.data,
      categoria: c.categoria,
      fixado: c.fixado,
      visivelParaTodos: c.visivelParaTodos,
      somenteDiretoria: c.somenteDiretoria ?? false,
      recorrente: c.recorrente ?? false,
      diaDoMes: c.diaDoMes ?? 1,
      ativo: c.ativo !== false,
    });
    setModalOpen(true);
  };

  const salvarComunicado = () => {
    const assunto = form.assunto?.trim() || form.titulo?.trim();
    if (!assunto || !user || !coopId) return;
    if (!cooperadoTemConteudoComunicado({ ...form, descricao: form.descricao ?? "", titulo: assunto } as Comunicado)) return;

    updateData((d) => {
      if (editingId) {
        const updated = {
          ...d,
          comunicados: d.comunicados.map((x) =>
            x.id === editingId
              ? {
                  ...x,
                  assunto,
                  titulo: assunto,
                  descricao: form.descricao?.trim() ?? "",
                  audioDataUrl: form.audioDataUrl,
                  data: form.data ?? x.data,
                  categoria: (form.categoria as ComunicadoCategoria) ?? "aviso_geral",
                  fixado: form.fixado ?? false,
                  visivelParaTodos: form.somenteDiretoria ? false : (form.visivelParaTodos ?? true),
                  somenteDiretoria: form.somenteDiretoria ?? false,
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
        assunto,
        titulo: assunto,
        descricao: form.descricao?.trim() ?? "",
        audioDataUrl: form.audioDataUrl,
        data: form.data ?? new Date().toISOString().split("T")[0],
        responsavel: user.name,
        categoria: (form.categoria as ComunicadoCategoria) ?? "aviso_geral",
        fixado: form.fixado ?? false,
        visivelParaTodos: form.somenteDiretoria ? false : (form.visivelParaTodos ?? true),
        somenteDiretoria: form.somenteDiretoria ?? false,
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
    if (!user || !confirm(`Remover o recado "${c.assunto ?? c.titulo}"?`)) return;
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
  const formValido = Boolean(
    (form.assunto?.trim() || form.titulo?.trim()) &&
      cooperadoTemConteudoComunicado({
        ...form,
        titulo: form.assunto?.trim() || form.titulo || "",
        descricao: form.descricao ?? "",
      } as Comunicado)
  );

  const FormularioComunicado = ({ idPrefix = "" }: { idPrefix?: string }) => (
    <div className="space-y-4">
      <FormField label="Assunto" required hint="Título curto que aparece no mural e na notificação">
        <Input
          id={`${idPrefix}assunto`}
          value={form.assunto ?? form.titulo ?? ""}
          onChange={(e) => setForm({ ...form, assunto: e.target.value, titulo: e.target.value })}
          placeholder="Ex: Reunião geral, prazo de entrega..."
        />
      </FormField>

      <FormField label="Aviso em áudio" hint="Grave o recado ou digite o texto abaixo (pelo menos um dos dois)">
        <AudioRecorder
          value={form.audioDataUrl}
          onChange={(audioDataUrl) => setForm({ ...form, audioDataUrl })}
        />
      </FormField>

      <FormField label="Texto do aviso" hint="Opcional se você gravou áudio">
        <Textarea
          id={`${idPrefix}descricao`}
          value={form.descricao ?? ""}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          rows={6}
          placeholder="Escreva aqui o comunicado para os cooperados..."
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
          Fixar no topo do mural
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.somenteDiretoria ?? false}
            onChange={(e) =>
              setForm({
                ...form,
                somenteDiretoria: e.target.checked,
                visivelParaTodos: e.target.checked ? false : form.visivelParaTodos,
              })
            }
            className="rounded"
          />
          Enviar apenas para cooperados da diretoria
        </label>
        {!form.somenteDiretoria && (
          <p className="text-xs text-gray-500 ml-6">
            Marque cooperados como diretoria em Cooperados → editar ficha.
          </p>
        )}
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
            ? "Assunto, texto ou áudio — publique no mural do início dos cooperados"
            : "Recados da cooperativa"
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
        <Card title="Novo recado" className="mb-6">
          <FormularioComunicado idPrefix="inline-" />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={limparFormulario} disabled={!form.assunto && !form.descricao && !form.audioDataUrl}>
              Limpar
            </Button>
            <Button onClick={salvarComunicado} disabled={!formValido}>
              <Plus size={18} /> Salvar recado
            </Button>
          </div>
        </Card>
      )}

      {canManage && (
        <AlertBanner variant="info" className="mb-4">
          Após salvar, toque em <strong>Enviar aos cooperados</strong>. O recado aparece no{" "}
          <strong>mural do início</strong> e gera notificação no celular (com permissão).
          {" "}Use <strong>apenas diretoria</strong> para avisos exclusivos — marque os cooperados em Cooperados.
        </AlertBanner>
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
          <ComunicadoCard
            key={c.id}
            comunicado={c}
            actions={
              canManage && !c.virtual ? (
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
              ) : undefined
            }
          />
        ))}
        {comunicadosExibicao.length === 0 && (
          <Card><p className="text-gray-500 text-center py-8">Nenhum recado publicado ainda.</p></Card>
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
