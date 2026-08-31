"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { GuestRoute } from "@/components/auth/GuestRoute";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { Input, Label } from "@/components/ui/Form";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/utils/constants";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(json.error ?? "Não foi possível processar o pedido. Tente novamente.");
        return;
      }
      setSent(true);
    } catch {
      setError("Erro de conexão. Verifique a internet e tente novamente.");
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
              <Mail size={22} className="text-green-700" />
              <h2 className="text-2xl font-bold text-gray-900">Recuperar senha</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Informe o e-mail da sua conta de cooperado. Enviaremos um link para redefinir a senha.
            </p>

            {sent ? (
              <div className="space-y-4">
                <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  Se o e-mail estiver cadastrado como cooperado, você receberá um link para redefinir a senha.
                  Verifique também a caixa de spam.
                </p>
                <Link href="/login" className="inline-flex items-center gap-2 text-green-700 font-medium hover:text-green-800">
                  <ArrowLeft size={16} /> Voltar ao login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? "Enviando…" : "Enviar link de recuperação"}
                </Button>

                <p className="text-center text-sm">
                  <Link href="/login" className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900">
                    <ArrowLeft size={14} /> Voltar ao login
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </GuestRoute>
  );
}
