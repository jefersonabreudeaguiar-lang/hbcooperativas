"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";
import { GuestRoute } from "@/components/auth/GuestRoute";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { Input, Label } from "@/components/ui/Form";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/utils/constants";

export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-500">
          Carregando…
        </div>
      }
    >
      <RedefinirSenhaForm />
    </Suspense>
  );
}

function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token")?.trim() ?? "";

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setTokenValid(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const json = (await res.json().catch(() => ({}))) as { valid?: boolean };
        if (!cancelled) setTokenValid(Boolean(json.valid));
      } catch {
        if (!cancelled) setTokenValid(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Não foi possível redefinir a senha.");
        return;
      }
      router.replace("/login?senha=redefinida");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GuestRoute>
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-4 mb-8 justify-center">
            <AppIcon size="xl" priority />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{PLATFORM_NAME}</h1>
              <p className="text-sm text-gray-500">{PLATFORM_TAGLINE}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={22} className="text-green-700" />
              <h2 className="text-2xl font-bold text-gray-900">Nova senha</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">Escolha uma nova senha para acessar sua conta de cooperado.</p>

            {checking ? (
              <p className="text-sm text-gray-500 text-center py-6">Validando link…</p>
            ) : !tokenValid ? (
              <div className="space-y-4">
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  Link inválido ou expirado. Solicite um novo e-mail de recuperação.
                </p>
                <Link
                  href="/esqueci-senha"
                  className="inline-flex items-center gap-2 text-green-700 font-medium hover:text-green-800"
                >
                  Solicitar novo link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="confirm">Confirmar nova senha</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={6}
                    required
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? "Salvando…" : "Salvar nova senha"}
                </Button>
              </form>
            )}

            <p className="text-center text-sm mt-6">
              <Link href="/login" className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900">
                <ArrowLeft size={14} /> Voltar ao login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </GuestRoute>
  );
}
