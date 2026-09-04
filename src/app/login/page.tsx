"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { GuestRoute } from "@/components/auth/GuestRoute";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { Input, Label } from "@/components/ui/Form";

import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/utils/constants";

const SEGMENTOS_ATENDIDOS = [
  "Agrícola e agroindustrial",
  "Crédito e consumo",
  "Transporte e logística",
  "Mercados e comércio",
  "Saúde e assistência",
  "Alimentação escolar",
  "Pesca e extrativismo",
  "Serviços e infraestrutura",
] as const;

function LoginHero() {
  return (
    <div className="relative z-10 w-full max-w-md lg:max-w-none">
      <div className="flex items-center gap-4 lg:gap-5 mb-6 lg:mb-8">
        <AppIcon size="xl" priority className="lg:hidden" />
        <AppIcon size="2xl" priority className="hidden lg:block" />
        <div>
          <h1 className="text-xl lg:text-3xl font-bold">{PLATFORM_NAME}</h1>
          <p className="text-green-300 text-sm lg:text-lg">{PLATFORM_TAGLINE}</p>
        </div>
      </div>
      <h2 className="text-xl lg:text-2xl font-semibold mb-3 lg:mb-4">Cooperativa com Transparência</h2>
      <p className="text-green-200 text-sm lg:text-lg leading-relaxed">
        Portal do cooperado e painel da diretoria para entregas, contratos, pagamentos, mensalidades,
        Conta Coop, votações e relatórios — pensado para cooperativas de diferentes segmentos.
      </p>
      <p className="text-green-300 text-xs lg:text-sm font-medium mt-6 lg:mt-8 mb-3 uppercase tracking-wide">
        Segmentos atendidos
      </p>
      <div className="grid grid-cols-2 gap-2 lg:gap-3">
        {SEGMENTOS_ATENDIDOS.map((item) => (
          <div
            key={item}
            className="bg-green-800/50 rounded-lg px-3 py-2.5 lg:px-4 lg:py-3 text-xs lg:text-sm font-medium border border-green-700"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-500">
          Carregando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const senhaRedefinida = searchParams.get("senha") === "redefinida";
  const redirectTo =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        router.push(result.redirectTo ?? redirectTo);
      } else {
        setError(
          result.error?.trim() ||
            "E-mail ou senha inválidos. Se usa Gmail, tente com ou sem pontos no e-mail."
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GuestRoute>
      <div className="min-h-screen flex flex-col lg:flex-row">
        <div className="bg-green-900 text-white px-6 py-8 lg:w-1/2 lg:flex lg:flex-col lg:justify-center lg:px-12 lg:py-12 relative overflow-hidden shrink-0">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-10 left-6 w-48 h-48 lg:top-20 lg:left-10 lg:w-64 lg:h-64 rounded-full bg-amber-400 blur-3xl" />
            <div className="absolute bottom-10 right-6 w-64 h-64 lg:bottom-20 lg:right-10 lg:w-96 lg:h-96 rounded-full bg-green-400 blur-3xl" />
          </div>
          <LoginHero />
        </div>

        <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Entrar</h2>
              <p className="text-sm text-gray-500 mb-6">Acesse com seu e-mail e senha</p>

              {senhaRedefinida && (
                <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
                  Senha redefinida com sucesso. Faça login com a nova senha.
                </p>
              )}

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
                  />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="text-right mt-2">
                    <Link href="/esqueci-senha" className="text-sm text-green-700 font-medium hover:text-green-800">
                      Esqueci minha senha
                    </Link>
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? "Entrando…" : "Entrar no Sistema"}
                </Button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                É cooperado e ainda não tem conta?{" "}
                <Link href="/cadastro" className="text-green-700 font-medium hover:text-green-800">
                  Cadastre-se aqui
                </Link>
              </p>

              <p className="text-center text-sm mt-4">
                <Link
                  href="/baixar-app"
                  className="inline-flex items-center gap-1.5 font-semibold text-green-800 hover:text-green-950"
                >
                  Baixar aplicativo — Android e iPhone
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </GuestRoute>
  );
}
