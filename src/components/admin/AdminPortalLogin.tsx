"use client";

import { useState } from "react";
import { Shield, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Form";
import { AdminPortalShell } from "@/components/admin/AdminPortalShell";

interface AdminPortalLoginProps {
  onLogin: (email: string, password: string) => Promise<boolean>;
}

export function AdminPortalLogin({ onLogin }: AdminPortalLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const ok = await onLogin(email.trim(), password);
      if (!ok) setError("E-mail ou senha inválidos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminPortalShell subtitle="Entrada exclusiva do criador">
      <div className="max-w-md mx-auto pt-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 text-white mb-3">
            <Shield size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Área administrativa</h1>
          <p className="text-sm text-gray-500 mt-2">
            Acesse com a conta do criador da plataforma. Esta tela fica fora do app das cooperativas.
          </p>
        </div>

        <Card title="Entrar">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <FormField label="E-mail">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="invisium3@gmail.com"
                required
                autoComplete="username"
              />
            </FormField>
            <FormField label="Senha">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar na área admin"}
            </Button>
          </form>
        </Card>
      </div>
    </AdminPortalShell>
  );
}
