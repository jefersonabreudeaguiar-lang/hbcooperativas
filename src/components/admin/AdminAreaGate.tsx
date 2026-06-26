"use client";

import { useState } from "react";
import { Shield, Lock, Eye, EyeOff, KeyRound, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppData } from "@/hooks/useAppData";
import { updateData } from "@/services/dataStore";
import {
  exigeSenhaAreaAdmin,
  getSenhaAreaAdminHash,
  verifySenhaAreaAdmin,
  unlockAdminArea,
  salvarSenhaAreaAdmin,
} from "@/services/adminAreaService";
import type { User } from "@/types";

type AdminUser = Pick<User, "id" | "name">;

interface AdminAreaGateProps {
  cooperativaId: string;
  user: AdminUser;
  onUnlocked: () => void;
}

export function AdminAreaGate({ cooperativaId, user, onUnlocked }: AdminAreaGateProps) {
  const data = useAppData();
  const cooperativa = data?.cooperativas.find((c) => c.id === cooperativaId);
  const senhaConfigurada = exigeSenhaAreaAdmin(cooperativa);

  const [modo, setModo] = useState<"login" | "cadastro" | "alterar">(
    senhaConfigurada ? "login" : "cadastro"
  );
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleLogin = async () => {
    setErro(null);
    setLoading(true);
    try {
      const hash = getSenhaAreaAdminHash(cooperativa);
      const ok = await verifySenhaAreaAdmin(senha, hash);
      if (!ok) {
        setErro("Senha incorreta. Tente novamente.");
        return;
      }
      unlockAdminArea(cooperativaId);
      onUnlocked();
    } finally {
      setLoading(false);
    }
  };

  const handleCadastrar = async () => {
    setErro(null);
    if (senha !== confirmar) {
      setErro("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const result = await salvarSenhaAreaAdmin(updateData, cooperativaId, senha, user);
      if (!result.success) {
        setErro(result.error ?? "Não foi possível salvar a senha.");
        return;
      }
      unlockAdminArea(cooperativaId);
      setSenha("");
      setConfirmar("");
      onUnlocked();
    } finally {
      setLoading(false);
    }
  };

  const handleAlterar = async () => {
    setErro(null);
    if (senha !== confirmar) {
      setErro("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const result = await salvarSenhaAreaAdmin(
        updateData,
        cooperativaId,
        senha,
        user,
        senhaAtual
      );
      if (!result.success) {
        setErro(result.error ?? "Não foi possível alterar a senha.");
        return;
      }
      setSenha("");
      setConfirmar("");
      setSenhaAtual("");
      setModo("login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white mb-4 shadow-lg">
          <Shield size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Área administrativa</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Painel executivo com indicadores, alertas operacionais e histórico. Acesso protegido por senha
          exclusiva da cooperativa.
        </p>
      </div>

      <Card className="border-slate-200 shadow-md">
        {modo === "login" && senhaConfigurada && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-slate-800">
              <Lock size={18} />
              <h2 className="font-semibold">Informe a senha de acesso</h2>
            </div>
            <p className="text-sm text-gray-500">
              Esta senha é independente do seu login pessoal. Apenas quem a conhece pode visualizar o painel
              completo.
            </p>
            {erro && (
              <AlertBanner variant="error" title="Acesso negado">
                {erro}
              </AlertBanner>
            )}
            <FormField label="Senha da área admin">
              <div className="relative">
                <Input
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                  autoComplete="current-password"
                  onKeyDown={(e) => e.key === "Enter" && void handleLogin()}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>
            <Button className="w-full" size="lg" onClick={() => void handleLogin()} disabled={loading || !senha}>
              {loading ? "Verificando…" : "Entrar no painel"}
            </Button>
            <button
              type="button"
              onClick={() => { setModo("alterar"); setErro(null); setSenha(""); }}
              className="w-full text-sm text-slate-600 hover:text-slate-900 underline"
            >
              Cadastrar ou alterar senha
            </button>
          </div>
        )}

        {modo === "cadastro" && !senhaConfigurada && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-slate-800">
              <KeyRound size={18} />
              <h2 className="font-semibold">Cadastrar senha de acesso</h2>
            </div>
            <AlertBanner variant="info" title="Primeiro acesso">
              Defina uma senha exclusiva para proteger o painel administrativo. Mínimo de 6 caracteres.
            </AlertBanner>
            {erro && (
              <AlertBanner variant="error" title="Erro">
                {erro}
              </AlertBanner>
            )}
            <FormField label="Nova senha" hint="Mínimo 6 caracteres">
              <Input
                type={showSenha ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="Confirmar senha">
              <div className="relative">
                <Input
                  type={showSenha ? "text" : "password"}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && void handleCadastrar()}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>
            <Button
              className="w-full"
              size="lg"
              onClick={() => void handleCadastrar()}
              disabled={loading || senha.length < 6 || !confirmar}
            >
              {loading ? "Salvando…" : "Cadastrar e entrar"}
            </Button>
          </div>
        )}

        {modo === "alterar" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-slate-800">
              <KeyRound size={18} />
              <h2 className="font-semibold">
                {senhaConfigurada ? "Alterar senha de acesso" : "Cadastrar senha de acesso"}
              </h2>
            </div>
            {senhaConfigurada && (
              <FormField label="Senha atual">
                <Input
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  autoComplete="current-password"
                />
              </FormField>
            )}
            <FormField label="Nova senha" hint="Mínimo 6 caracteres">
              <Input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="Confirmar nova senha">
              <Input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            {erro && (
              <AlertBanner variant="error" title="Erro">
                {erro}
              </AlertBanner>
            )}
            {senhaConfigurada ? (
              <Button
                onClick={() => void handleAlterar()}
                disabled={loading || senha.length < 6 || !confirmar || !senhaAtual}
              >
                {loading ? "Salvando…" : "Salvar senha"}
              </Button>
            ) : (
              <Button
                onClick={() => void handleCadastrar()}
                disabled={loading || senha.length < 6 || !confirmar}
              >
                {loading ? "Salvando…" : "Cadastrar e entrar"}
              </Button>
            )}
            {senhaConfigurada && (
              <Button variant="secondary" onClick={() => { setModo("login"); setErro(null); }}>
                Voltar ao login
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
