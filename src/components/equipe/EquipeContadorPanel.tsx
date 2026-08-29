"use client";

import { useMemo, useState } from "react";
import { Plus, Calculator, Shield } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Table";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData } from "@/services/dataStore";
import {
  aplicarAtualizacaoMembroEquipe,
  aplicarContadorEquipeCriado,
  criarContadorEquipe,
  listContadoresEquipeIncluindoInativos,
} from "@/services/equipeService";
import { CONTADOR_ACESSO_DESCRICAO, PRESET_CONTADOR, getUserFuncaoLabel } from "@/permissions";
import { MODULOS_ACESSO } from "@/permissions";
import type { User } from "@/types";

interface EquipeContadorPanelProps {
  cooperativaId: string;
  cooperativaCnpj?: string;
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  funcao: "Contador",
};

export function EquipeContadorPanel({ cooperativaId, cooperativaCnpj }: EquipeContadorPanelProps) {
  const data = useAppData();
  const { user, podeGerenciarEquipe } = usePermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [erro, setErro] = useState("");

  const contadores = useMemo(() => {
    if (!data) return [];
    return listContadoresEquipeIncluindoInativos(data, cooperativaId);
  }, [data, cooperativaId]);

  const modulosContador = useMemo(
    () => MODULOS_ACESSO.filter((m) => PRESET_CONTADOR.includes(m.resource)),
    []
  );

  if (!data || !user || !podeGerenciarEquipe) return null;

  const abrirNovo = () => {
    setEditando(null);
    setForm(emptyForm);
    setErro("");
    setModalOpen(true);
  };

  const abrirEditar = (contador: User) => {
    setEditando(contador);
    setForm({
      name: contador.name,
      email: contador.email,
      password: "",
      funcao: contador.funcao ?? "Contador",
    });
    setErro("");
    setModalOpen(true);
  };

  const salvar = () => {
    setErro("");
    if (editando) {
      const result = aplicarAtualizacaoMembroEquipe(data, user, editando.id, {
        name: form.name,
        funcao: form.funcao,
        password: form.password || undefined,
      });
      if (!result.ok) {
        setErro(result.error);
        return;
      }
      updateData(() => result.data);
    } else {
      const criado = criarContadorEquipe(data, user, cooperativaId, cooperativaCnpj, form);
      if (!criado.ok) {
        setErro(criado.error);
        return;
      }
      updateData((d) => aplicarContadorEquipeCriado(d, user, criado.user));
    }
    setModalOpen(false);
  };

  const desativar = (contador: User) => {
    const result = aplicarAtualizacaoMembroEquipe(data, user, contador.id, { active: false });
    if (result.ok) updateData(() => result.data);
  };

  const reativar = (contador: User) => {
    const result = aplicarAtualizacaoMembroEquipe(data, user, contador.id, { active: true });
    if (result.ok) updateData(() => result.data);
  };

  return (
    <>
      <Card title="Contador / auditoria" className="mb-6">
        <p className="text-sm text-gray-500 mb-3">{CONTADOR_ACESSO_DESCRICAO}</p>

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 mb-2 flex items-center gap-2">
            <Shield size={14} /> Acesso incluído automaticamente
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-blue-950">
            {modulosContador.map((m) => (
              <li key={m.resource}>• {m.label}</li>
            ))}
          </ul>
          <p className="text-xs text-blue-800 mt-2">Somente consulta e exportação — sem alterar entregas, pagamentos ou cadastros.</p>
        </div>

        <div className="space-y-3">
          {contadores.length === 0 && (
            <p className="text-sm text-gray-500 py-2">Nenhum contador cadastrado ainda.</p>
          )}
          {contadores.map((c) => (
            <div
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 bg-white"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 flex items-center gap-2">
                  <Calculator size={16} className="text-blue-700 shrink-0" />
                  {c.name}
                  {!c.active && (
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Inativo</span>
                  )}
                </p>
                <p className="text-sm text-gray-500 truncate">{c.email}</p>
                <p className="text-xs text-gray-600 mt-1">{getUserFuncaoLabel(c)} · Somente leitura</p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => abrirEditar(c)}>
                  Editar
                </Button>
                {c.active ? (
                  <Button size="sm" variant="secondary" onClick={() => desativar(c)}>
                    Desativar
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => reativar(c)}>
                    Reativar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button className="mt-4" onClick={abrirNovo}>
          <Plus size={16} /> Cadastrar contador
        </Button>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? "Editar contador" : "Cadastrar contador"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar}>Salvar</Button>
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
              placeholder="Contador, Auditor externo, CRC…"
            />
          </FormField>
          {!editando && (
            <p className="text-xs text-gray-600 rounded-lg bg-gray-50 border border-gray-100 p-3">
              O contador terá acesso à Central do Contador, conciliação, trilha de auditoria, relatórios e parecer mensal —
              sem permissão para alterar operações da cooperativa.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
