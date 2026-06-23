"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Leaf, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { GuestRoute } from "@/components/auth/GuestRoute";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { Input, Label } from "@/components/ui/Form";

import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/utils/constants";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const success = await login(email, password);
      if (success) {
        router.push("/dashboard");
      } else {
        setError("E-mail ou senha inválidos.");
      }
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <GuestRoute>
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-green-900 text-white flex-col justify-center px-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-amber-400 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-green-400 blur-3xl" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-5 mb-8">
            <AppIcon size="2xl" priority />
            <div>
              <h1 className="text-3xl font-bold">{PLATFORM_NAME}</h1>
              <p className="text-green-300 text-lg">{PLATFORM_TAGLINE}</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold mb-4">Agricultura Familiar com Transparência</h2>
          <p className="text-green-200 text-lg leading-relaxed max-w-md">
            Portal do cooperado e painel administrativo para controle de entregas, PNAE, pagamentos, mensalidades, cotas e relatórios financeiros.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 max-w-sm">
            {["Entregas PNAE", "Pagamentos", "Mensalidades", "Relatórios"].map((item) => (
              <div key={item} className="bg-green-800/50 rounded-lg px-4 py-3 text-sm font-medium border border-green-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-4 mb-8 justify-center">
            <AppIcon size="xl" priority />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{PLATFORM_NAME}</h1>
              <p className="text-sm text-gray-500">{PLATFORM_TAGLINE}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Entrar</h2>
            <p className="text-sm text-gray-500 mb-6">Acesse com seu e-mail e senha</p>

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
          </div>
        </div>
      </div>
    </div>
    </GuestRoute>
  );
}
