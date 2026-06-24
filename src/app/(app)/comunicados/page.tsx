"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Repeat, Pause, Play, Trash2, RefreshCw, Send, Pencil } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData, generateId, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import {
  getComunicadosParaExibicao,
  getComunicadosCooperado,
  cooperadoTemConteudoComunicado,
  getComunicadoAssunto,
} from "@/services/comunicadoService";
import { ComunicadoForm } from "@/components/comunicado/ComunicadoForm";
import { ComunicadoCard } from "@/components/comunicado/ComunicadoCard";
import type { Comunicado, ComunicadoCategoria } from "@/types";

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

function formTemAssunto(form: Partial<Comunicado>): boolean {
  return Boolean(form.assunto?.trim() || form.titulo?.trim());
}

function formTemConteudo(form: Partial<Comunicado>): boolean {
  return cooperadoTemConteudoComunicado({
    ...form,
    titulo: form.assunto?.trim() || form.titulo?.trim() || "",
    descricao: form.descricao ?? "",
  } as Comunicado);
}

function formularioPreenchido(form: Partial<Comunicado>): boolean {
  return Boolean(form.assunto?.trim() || form.titulo?.trim() || form.descricao?.trim() || form.audioDataUrl);
}

export default function ComunicadosPage() {
  const data = useAppData();
  const router = useRouter();
  const { check, user, isCooperado, cooperadoId } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<Comunicado>>(FORM_VAZIO());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alteracoesPendentes, setAlteracoesPendentes] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [msgPublicacao, setMsgPublicacao] = useState("");

  useEffect(() => {
    if (isCooperado) router.replace("/dashboard");
  }, [isCooperado, router]);

  const handleFormChange = useCallback((patch: Partial<Comunicado>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

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
    if (!formTemConteudo(form)) return;

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
    if (!user || !confirm(`Remover o recado "${getComunicadoAssunto(c)}"?`)) return;
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
      setMsgPublicacao("Avisos enviados! Os cooperados verão no início.");
    } catch {
      setMsgPublicacao("Não foi possível enviar. Verifique a internet e tente de novo.");
    } finally {
      setPublicando(false);
    }
  };

  if (!data) return null;
  if (isCooperado) return null;

  const canManage = check("comunicados", "create");
  const formValido = formTemAssunto(form) && formTemConteudo(form);

  return (
    <div>
      <PageHeader
        title="Comunicados"
        subtitle={
          canManage
            ? "Assunto, texto ou áudio — publique no início dos cooperados"
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

      {canManage && !modalOpen && (
        <Card title="Novo recado" className="mb-6">
          <ComunicadoForm form={form} onFormChange={handleFormChange} idPrefix="inline-" />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <Button variant="secondary" onClick={limparFormulario} disabled={!formularioPreenchido(form)}>
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
          <strong>início</strong> e gera notificação no celular (com permissão).
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
                  <p className="font-medium text-gray-900 truncate">{getComunicadoAssunto(c)}</p>
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
        {(Object.entries({
          financeiro: "Financeiro",
          reuniao: "Reunião",
          entrega: "Entrega",
          documentacao: "Documentação",
          aviso_geral: "Aviso Geral",
        }) as [ComunicadoCategoria, string][]).map(([k, v]) => (
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
        <ComunicadoForm form={form} onFormChange={handleFormChange} idPrefix="modal-" />
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
