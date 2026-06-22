"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, UserCog, Shield, Save } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Table";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData } from "@/services/dataStore";
import {
  aplicarAtualizacaoMembroEquipe,
  aplicarMembroEquipeCriado,
  criarMembroEquipe,
  listMembrosEquipeIncluindoInativos,
  modulosDisponiveisParaForm,
  presetModulosRelatorios,
} from "@/services/equipeService";
import {
  MODO_ACESSO_LABELS,
  modulosLiberados,
  modulosRestritos,
  getUserFuncaoLabel,
} from "@/permissions";
import type { ModoAcesso, Resource, User } from "@/types";

interface EquipeResponsaveisPanelProps {
  cooperativaId: string;
  cooperativaCnpj?: string;
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  funcao: "",
  modoAcesso: "parcial" as ModoAcesso,
  modulosLiberados: presetModulosRelatorios(),
  modulosRestritos: [] as Resource[],
};

export function EquipeResponsaveisPanel({ cooperativaId, cooperativaCnpj }: EquipeResponsaveisPanelProps) {
  const data = useAppData();
  const { user, podeGerenciarEquipe } = usePermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [erro, setErro] = useState("");
  const [funcaoPrincipal, setFuncaoPrincipal] = useState("");
  const [salvouFuncao, setSalvouFuncao] = useState(false);

  const modulos = modulosDisponiveisParaForm();

  const membros = useMemo(() => {
    if (!data) return [];
    return listMembrosEquipeIncluindoInativos(data, cooperativaId);
  }, [data, cooperativaId]);

  const principal = useMemo(() => membros.find((m) => m.responsavelPrincipal), [membros]);

  useEffect(() => {
    if (principal?.funcao) setFuncaoPrincipal(principal.funcao);
    else if (principal) setFuncaoPrincipal("Responsável principal");
  }, [principal?.id, principal?.funcao]);

  if (!data || !user || !podeGerenciarEquipe) return null;

  const abrirNovo = () => {
    setEditando(null);
    setForm(emptyForm);
    setErro("");
    setModalOpen(true);
  };

  const abrirEditar = (membro: User) => {
    if (membro.responsavelPrincipal) return;
    setEditando(membro);
    setForm({
      name: membro.name,
      email: membro.email,
      password: "",
      funcao: membro.funcao ?? "",
      modoAcesso: membro.modoAcesso ?? "total",
      modulosLiberados: modulosLiberados(membro),
      modulosRestritos: modulosRestritos(membro),
    });
    setErro("");
    setModalOpen(true);
  };

  const toggleModulo = (resource: Resource, checked: boolean) => {
    if (form.modoAcesso === "parcial") {
      setForm((f) => ({
        ...f,
        modulosLiberados: checked
          ? [...new Set([...f.modulosLiberados, resource])]
          : f.modulosLiberados.filter((r) => r !== resource),
      }));
      return;
    }
    setForm((f) => ({
      ...f,
      modulosRestritos: checked
        ? [...new Set([...f.modulosRestritos, resource])]
        : f.modulosRestritos.filter((r) => r !== resource),
    }));
  };

  const salvarMembro = () => {
    setErro("");
    if (editando) {
      const result = aplicarAtualizacaoMembroEquipe(data, user, editando.id, {
        name: form.name,
        funcao: form.funcao,
        password: form.password || undefined,
        modoAcesso: form.modoAcesso,
        modulosLiberados: form.modulosLiberados,
        modulosRestritos: form.modulosRestritos,
      });
      if (!result.ok) {
        setErro(result.error);
        return;
      }
      updateData(() => result.data);
    } else {
      const criado = criarMembroEquipe(data, user, cooperativaId, cooperativaCnpj, form);
      if (!criado.ok) {
        setErro(criado.error);
        return;
      }
      updateData((d) => aplicarMembroEquipeCriado(d, user, criado.user));
    }
    setModalOpen(false);
  };

  const salvarFuncaoPrincipal = () => {
    if (!principal) return;
    updateData((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.id === principal.id ? { ...u, funcao: funcaoPrincipal.trim() || "Responsável principal" } : u
      ),
    }));
    setSalvouFuncao(true);
    setTimeout(() => setSalvouFuncao(false), 2500);
  };

  const desativarMembro = (membro: User) => {
    if (membro.responsavelPrincipal) return;
    const result = aplicarAtualizacaoMembroEquipe(data, user, membro.id, { active: false });
    if (result.ok) updateData(() => result.data);
  };

  const reativarMembro = (membro: User) => {
    const result = aplicarAtualizacaoMembroEquipe(data, user, membro.id, { active: true });
    if (result.ok) updateData(() => result.data);
  };

  return (
    <>
      <Card title="Equipe e acessos" className="mb-6">
        <p className="text-sm text-gray-500 mb-4">
          Cadastre outros responsáveis com acesso total ou parcial. Quem emite relatório terá nome, função e campo para assinatura.
        </p>

        {principal && (
          <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-800 mb-2">Responsável principal</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <FormField label="Função do responsável principal">
                <Input
                  value={funcaoPrincipal}
                  onChange={(e) => setFuncaoPrincipal(e.target.value)}
                  placeholder="Ex.: Presidente, Diretor"
                />
              </FormField>
              <Button onClick={salvarFuncaoPrincipal}>
                <Save size={16} /> {salvouFuncao ? "Salvo!" : "Salvar função"}
              </Button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {principal.name} · {principal.email}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {membros
            .filter((m) => !m.responsavelPrincipal)
            .map((membro) => (
              <div
                key={membro.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 bg-white"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <UserCog size={16} className="text-green-700 shrink-0" />
                    {membro.name}
                    {!membro.active && (
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 truncate">{membro.email}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {getUserFuncaoLabel(membro)} · {MODO_ACESSO_LABELS[membro.modoAcesso ?? "total"]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => abrirEditar(membro)}>
                    Editar
                  </Button>
                  {membro.active ? (
                    <Button size="sm" variant="secondary" onClick={() => desativarMembro(membro)}>
                      Desativar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => reativarMembro(membro)}>
                      Reativar
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </div>

        <Button className="mt-4" onClick={abrirNovo}>
          <Plus size={16} /> Adicionar responsável
        </Button>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? "Editar acesso" : "Novo responsável"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvarMembro}>Salvar</Button>
          </div>
        }
      >
        {erro && (
          <AlertBanner variant="error" title="Não foi possível salvar" className="mb-4">
            {erro}
          </AlertBanner>
        )}

        <div className="space-y-4">
          <FormField label="Nome completo">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="E-mail (login)">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!editando}
            />
          </FormField>
          <FormField label={editando ? "Nova senha (opcional)" : "Senha inicial"} hint="Mínimo 6 caracteres">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </FormField>
          <FormField label="Função / cargo">
            <Input
              value={form.funcao}
              onChange={(e) => setForm({ ...form, funcao: e.target.value })}
              placeholder="Ex.: Secretário, Conferente, Tesoureiro adjunto"
            />
          </FormField>
          <FormField label="Tipo de acesso">
            <Select
              value={form.modoAcesso}
              onChange={(e) =>
                setForm({
                  ...form,
                  modoAcesso: e.target.value as ModoAcesso,
                  modulosLiberados:
                    e.target.value === "parcial" ? presetModulosRelatorios() : form.modulosLiberados,
                  modulosRestritos: e.target.value === "total" ? [] : form.modulosRestritos,
                })
              }
            >
              <option value="parcial">{MODO_ACESSO_LABELS.parcial}</option>
              <option value="total">{MODO_ACESSO_LABELS.total}</option>
            </Select>
          </FormField>

          <div>
            <p className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
              <Shield size={16} className="text-green-700" />
              {form.modoAcesso === "parcial" ? "Módulos liberados" : "Módulos com restrição"}
            </p>
            <p className="text-xs text-gray-500 mb-3">
              {form.modoAcesso === "parcial"
                ? "Marque apenas o que este responsável pode acessar (ex.: só Relatórios)."
                : "Marque o que deve ficar bloqueado sobre o acesso padrão da função."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {modulos.map((mod) => {
                const checked =
                  form.modoAcesso === "parcial"
                    ? form.modulosLiberados.includes(mod.resource)
                    : form.modulosRestritos.includes(mod.resource);
                return (
                  <label
                    key={mod.resource}
                    className="flex items-start gap-2 text-sm rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleModulo(mod.resource, e.target.checked)}
                      className="rounded mt-0.5"
                    />
                    <span>{mod.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
