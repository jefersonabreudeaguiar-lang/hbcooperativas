"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Form";
import type { Cooperado, User } from "@/types";
import {
  definirSenhaTemporariaCooperado,
  findLoginCooperado,
} from "@/services/cooperadoLoginService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";

interface CooperadoAcessoLoginPanelProps {
  cooperado: Cooperado;
  user: User;
}

export function CooperadoAcessoLoginPanel({ cooperado, user }: CooperadoAcessoLoginPanelProps) {
  const data = useAppData();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const conta = data ? findLoginCooperado(data, cooperado.id) : undefined;

  useEffect(() => {
    setEmail(conta?.email ?? "");
    setSenha("");
    setErro("");
    setSucesso("");
  }, [cooperado.id, conta?.email]);

  const salvar = async () => {
    if (!data || !user) return;
    setSalvando(true);
    setErro("");
    setSucesso("");

    const coopId = getUserCooperativaId(user, data);
    const cnpj = await resolveCooperativaCnpj(data, coopId, user);

    const result = await definirSenhaTemporariaCooperado(data, user, coopId ?? "", cnpj, cooperado, {
      email,
      password: senha,
    });

    setSalvando(false);
    if (!result.ok) {
      setErro(result.error);
      return;
    }

    setSucesso(
      conta
        ? `Senha temporária atualizada. Informe ao cooperado: e-mail ${result.email} e a nova senha. Ele pode trocar em Meu cadastro.`
        : `Conta criada. Informe ao cooperado: e-mail ${result.email} e a senha temporária. Ele pode trocar em Meu cadastro após entrar.`
    );
    setSenha("");
  };

  return (
    <div className="md:col-span-2 mt-2 pt-4 border-t border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={18} className="text-green-700" />
        <h3 className="text-sm font-semibold text-gray-900">Acesso ao sistema (login)</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Defina uma senha temporária para o cooperado entrar no app. Depois do primeiro acesso, ele pode
        criar uma senha nova em <strong>Meu cadastro</strong>.
      </p>

      {conta && (
        <p className="text-xs text-gray-600 mb-3">
          Conta ativa: <strong>{conta.email}</strong>
        </p>
      )}

      {erro && (
        <AlertBanner variant="error" title="Não foi possível salvar" className="mb-3">
          {erro}
        </AlertBanner>
      )}

      {sucesso && (
        <AlertBanner variant="success" title="Senha definida" className="mb-3">
          {sucesso}
        </AlertBanner>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="E-mail de login" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cooperado@email.com"
          />
        </FormField>
        <FormField label="Senha temporária" required hint="Mínimo 6 caracteres — repasse pessoalmente ou por WhatsApp">
          <Input
            type="text"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Ex.: Coop2026"
            autoComplete="off"
          />
        </FormField>
      </div>

      <Button className="mt-4" onClick={() => void salvar()} disabled={salvando || !email.trim() || senha.length < 6}>
        {salvando ? "Salvando…" : conta ? "Atualizar senha temporária" : "Criar acesso com senha temporária"}
      </Button>
    </div>
  );
}
