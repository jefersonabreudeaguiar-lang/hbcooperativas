"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, CheckCircle2, AlertCircle, User, Building2 } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { GuestRoute } from "@/components/auth/GuestRoute";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { Input, Label } from "@/components/ui/Form";
import { lookupCooperativaByCnpjAsync, subscribe } from "@/services/dataStore";
import { fetchCloudStatus, type CloudStatus } from "@/services/cooperativaCloudService";
import { formatCnpj, normalizeCnpj } from "@/utils/cooperativa";
import { PLATFORM_NAME } from "@/utils/constants";
import { cn } from "@/utils/format";

type AbaCadastro = "cooperado" | "responsavel";

export default function CadastroPage() {
  const [aba, setAba] = useState<AbaCadastro>("cooperado");

  // Cooperado
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [cooperativaCnpj, setCooperativaCnpj] = useState("");
  const [cooperativaNome, setCooperativaNome] = useState<string | null>(null);
  const [cooperativaValida, setCooperativaValida] = useState<boolean | null>(null);
  const [exigeSenhaCadastro, setExigeSenhaCadastro] = useState(false);
  const [senhaCooperativa, setSenhaCooperativa] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [comunidade, setComunidade] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Responsável / Cooperativa
  const [nomeCooperativa, setNomeCooperativa] = useState("");
  const [cnpjCooperativa, setCnpjCooperativa] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [emailResponsavel, setEmailResponsavel] = useState("");
  const [telefoneCoop, setTelefoneCoop] = useState("");
  const [enderecoCoop, setEnderecoCoop] = useState("");
  const [passwordResp, setPasswordResp] = useState("");
  const [confirmPasswordResp, setConfirmPasswordResp] = useState("");
  const [senhaCadastroCooperado, setSenhaCadastroCooperado] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showSenhaAcessoCadastro, setShowSenhaAcessoCadastro] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [validandoCnpj, setValidandoCnpj] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const { register, registerCooperativa } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setError("");
    setSuccess("");
  }, [aba]);

  useEffect(() => {
    fetchCloudStatus().then(({ status, message }) => {
      setCloudStatus(status);
      setCloudMessage(message ?? null);
    });
  }, []);

  const revalidarCnpjCooperativa = useCallback(async () => {
    const digits = normalizeCnpj(cooperativaCnpj);
    if (digits.length < 14) {
      setCooperativaNome(null);
      setCooperativaValida(digits.length === 0 ? null : false);
      setExigeSenhaCadastro(false);
      return;
    }
    setValidandoCnpj(true);
    setLookupError(null);
    try {
      const coop = await lookupCooperativaByCnpjAsync(digits);
      if (coop) {
        setCooperativaNome(coop.nome);
        setCooperativaValida(true);
        setExigeSenhaCadastro(!!coop.exigeSenhaCadastro);
      } else {
        setCooperativaNome(null);
        setCooperativaValida(false);
        setExigeSenhaCadastro(false);
        if (cloudStatus === "ok") {
          setLookupError("Este CNPJ ainda não foi cadastrado na nuvem. A diretoria precisa concluir o cadastro em Sou Responsável.");
        }
      }
    } finally {
      setValidandoCnpj(false);
    }
  }, [cooperativaCnpj, cloudStatus]);

  useEffect(() => {
    revalidarCnpjCooperativa();
    return subscribe(revalidarCnpjCooperativa);
  }, [revalidarCnpjCooperativa]);

  useEffect(() => {
    if (aba === "cooperado") revalidarCnpjCooperativa();
  }, [aba, revalidarCnpjCooperativa]);

  const handleCooperadoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (!cooperativaValida) {
      setError("Informe o CNPJ de uma cooperativa já cadastrada pela diretoria.");
      return;
    }
    if (exigeSenhaCadastro && !senhaCooperativa.trim()) {
      setError("Informe a senha de acesso ao cadastro fornecida pela cooperativa.");
      return;
    }

    setLoading(true);
    const result = await register({
      nomeCompleto,
      email,
      password,
      cooperativaCnpj,
      cpfCnpj,
      telefone,
      comunidade,
      senhaCadastroCooperado: senhaCooperativa.trim() || undefined,
    });
    setLoading(false);

    if (result.success) {
      router.replace("/meu-cadastro?novo=1");
    } else {
      setError(result.error ?? "Não foi possível concluir o cadastro.");
    }
  };

  const irParaResponsavel = () => {
    setAba("responsavel");
    if (cooperativaCnpj) setCnpjCooperativa(cooperativaCnpj);
    setError("");
    setSuccess("");
  };

  const handleResponsavelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (passwordResp !== confirmPasswordResp) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const result = await registerCooperativa({
      nome: nomeCooperativa,
      cnpj: cnpjCooperativa,
      responsavel: nomeResponsavel,
      email: emailResponsavel,
      password: passwordResp,
      telefone: telefoneCoop,
      endereco: enderecoCoop,
      senhaCadastroCooperado: senhaCadastroCooperado.trim() || undefined,
    });
    setLoading(false);

    if (result.success) {
      const verified = await lookupCooperativaByCnpjAsync(cnpjCooperativa);
      if (!verified) {
        setError("Cadastro concluído, mas o CNPJ ainda não apareceu na nuvem. Faça login e abra Perfil da cooperativa.");
        return;
      }
      setSuccess(
        `Cooperativa "${verified.nome}" cadastrada na nuvem! CNPJ ${formatCnpj(normalizeCnpj(cnpjCooperativa))} — os cooperados já podem se cadastrar.`
      );
      setTimeout(() => router.push("/dashboard"), 2000);
    } else {
      setError(result.error ?? "Não foi possível cadastrar a cooperativa.");
    }
  };

  const painelEsquerdo = aba === "cooperado"
    ? {
        titulo: "Cadastre-se na sua cooperativa",
        texto: "Informe o CNPJ da cooperativa cadastrada pela diretoria. O nome aparecerá automaticamente após a validação.",
      }
    : {
        titulo: "Cadastre sua cooperativa",
        texto: "Responsável: registre o CNPJ e os dados da cooperativa. Depois disso, os cooperados poderão se vincular pelo CNPJ.",
      };

  return (
    <GuestRoute authenticatedRedirect={false}>
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
                <p className="text-green-300 text-lg">Portal de Cadastro</p>
              </div>
            </div>
            <h2 className="text-2xl font-semibold mb-4">{painelEsquerdo.titulo}</h2>
            <p className="text-green-200 text-lg leading-relaxed max-w-md">{painelEsquerdo.texto}</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex items-center gap-4 mb-6 justify-center">
              <AppIcon size="xl" priority />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{PLATFORM_NAME}</h1>
                <p className="text-sm text-gray-500">Portal de Cadastro</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
              {/* Abas */}
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setAba("cooperado")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors",
                    aba === "cooperado"
                      ? "bg-green-50 text-green-800 border-b-2 border-green-700 -mb-px"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <User size={18} />
                  Sou Cooperado
                </button>
                <button
                  type="button"
                  onClick={() => setAba("responsavel")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors",
                    aba === "responsavel"
                      ? "bg-green-50 text-green-800 border-b-2 border-green-700 -mb-px"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Building2 size={18} />
                  Sou Responsável
                </button>
              </div>

              <div className="p-8">
                {aba === "cooperado" ? (
                  <>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Conta de cooperado</h2>
                    <p className="text-sm text-gray-500 mb-6">Vincule-se à cooperativa pelo CNPJ</p>

                    <form onSubmit={handleCooperadoSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="cnpjCoop">CNPJ da Cooperativa</Label>
                        <Input
                          id="cnpjCoop"
                          value={cooperativaCnpj}
                          onChange={(e) => {
                            const digits = normalizeCnpj(e.target.value).slice(0, 14);
                            setCooperativaCnpj(digits.length === 14 ? formatCnpj(digits) : e.target.value);
                          }}
                          onBlur={revalidarCnpjCooperativa}
                          placeholder="00.000.000/0000-00"
                          inputMode="numeric"
                          required
                        />
                        {validandoCnpj && (
                          <p className="mt-2 text-sm text-gray-500">Consultando CNPJ na nuvem...</p>
                        )}
                        {cloudStatus === "migration_pending" && (
                          <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium">Nuvem ainda não configurada no Supabase</p>
                              <p className="mt-1">
                                A tabela <strong>cooperativas</strong> precisa ser criada uma vez no Supabase.
                                Abra o painel → <strong>SQL Editor</strong> → cole o arquivo{" "}
                                <strong>supabase/migrations/20260320120000_cooperativas.sql</strong> → Run.
                                Depois cadastre a cooperativa na aba <strong>Sou Responsável</strong>.
                              </p>
                            </div>
                          </div>
                        )}
                        {cooperativaValida === true && cooperativaNome && (
                          <div className="mt-2 flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium">Cooperativa encontrada</p>
                              <p>{cooperativaNome}</p>
                            </div>
                          </div>
                        )}
                        {cooperativaValida === false && cloudStatus !== "migration_pending" && (
                          <div className="mt-2 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <div className="space-y-3">
                              <div>
                                <p className="font-medium">CNPJ não encontrado na nuvem</p>
                                <p className="mt-1">
                                  {lookupError ?? (
                                    <>
                                      A cooperativa ainda não foi registrada na nuvem. Quem cuida da diretoria precisa cadastrá-la primeiro.
                                    </>
                                  )}
                                </p>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <Button type="button" variant="secondary" size="sm" onClick={irParaResponsavel}>
                                  Sou responsável — cadastrar
                                </Button>
                                <Link href="/login">
                                  <Button type="button" variant="secondary" size="sm" className="w-full sm:w-auto">
                                    Já tenho conta — entrar
                                  </Button>
                                </Link>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={validandoCnpj}
                                  onClick={revalidarCnpjCooperativa}
                                >
                                  Consultar novamente
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {exigeSenhaCadastro && cooperativaValida && (
                        <div>
                          <Label htmlFor="senhaCooperativa">Senha de acesso ao cadastro</Label>
                          <div className="relative">
                            <Input
                              id="senhaCooperativa"
                              type={showSenhaAcessoCadastro ? "text" : "password"}
                              value={senhaCooperativa}
                              onChange={(e) => setSenhaCooperativa(e.target.value)}
                              placeholder="Fornecida pela cooperativa"
                              className="pr-10"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowSenhaAcessoCadastro((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              aria-label={showSenhaAcessoCadastro ? "Ocultar senha" : "Mostrar senha"}
                            >
                              {showSenhaAcessoCadastro ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Senha da cooperativa para liberar o cadastro pelo CNPJ — não é a senha pessoal da sua conta.
                          </p>
                        </div>
                      )}

                      <div>
                        <Label htmlFor="nome">Nome completo</Label>
                        <Input id="nome" value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} required />
                      </div>
                      <div>
                        <Label htmlFor="email">E-mail</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="cpf">Seu CPF</Label>
                          <Input id="cpf" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} placeholder="Opcional" />
                        </div>
                        <div>
                          <Label htmlFor="telefone">Telefone</Label>
                          <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Opcional" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="comunidade">Comunidade / Localidade</Label>
                        <Input id="comunidade" value={comunidade} onChange={(e) => setComunidade(e.target.value)} placeholder="Opcional" />
                      </div>
                      <div>
                        <Label htmlFor="password">Senha de acesso (sua conta)</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            minLength={6}
                            required
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="confirmPassword">Confirmar senha de acesso</Label>
                        <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
                      </div>

                      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                      <Button type="submit" className="w-full" size="lg" disabled={loading || cooperativaValida !== true}>
                        {loading ? "Cadastrando..." : "Cadastrar e Entrar"}
                      </Button>
                    </form>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Cadastro da cooperativa</h2>
                    <p className="text-sm text-gray-500 mb-6">Responsável — registre a cooperativa no sistema</p>

                    <form onSubmit={handleResponsavelSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="nomeCoop">Nome da Cooperativa</Label>
                        <Input id="nomeCoop" value={nomeCooperativa} onChange={(e) => setNomeCooperativa(e.target.value)} placeholder="Nome oficial" required />
                      </div>
                      <div>
                        <Label htmlFor="cnpjCooperativa">CNPJ da Cooperativa</Label>
                        <Input id="cnpjCooperativa" value={cnpjCooperativa} onChange={(e) => setCnpjCooperativa(e.target.value)} placeholder="00.000.000/0000-00" required />
                      </div>
                      <div>
                        <Label htmlFor="nomeResponsavel">Nome do Responsável</Label>
                        <Input id="nomeResponsavel" value={nomeResponsavel} onChange={(e) => setNomeResponsavel(e.target.value)} placeholder="Nome do responsável" required />
                      </div>
                      <div>
                        <Label htmlFor="emailResp">E-mail de acesso</Label>
                        <Input id="emailResp" type="email" value={emailResponsavel} onChange={(e) => setEmailResponsavel(e.target.value)} required />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="telCoop">Telefone</Label>
                          <Input id="telCoop" value={telefoneCoop} onChange={(e) => setTelefoneCoop(e.target.value)} placeholder="Opcional" />
                        </div>
                        <div>
                          <Label htmlFor="endCoop">Endereço</Label>
                          <Input id="endCoop" value={enderecoCoop} onChange={(e) => setEnderecoCoop(e.target.value)} placeholder="Opcional" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="passwordResp">Senha de acesso (sua conta)</Label>
                        <div className="relative">
                          <Input
                            id="passwordResp"
                            type={showPassword ? "text" : "password"}
                            value={passwordResp}
                            onChange={(e) => setPasswordResp(e.target.value)}
                            minLength={6}
                            required
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="confirmPasswordResp">Confirmar senha de acesso</Label>
                        <Input id="confirmPasswordResp" type="password" value={confirmPasswordResp} onChange={(e) => setConfirmPasswordResp(e.target.value)} minLength={6} required />
                      </div>
                      <div>
                        <Label htmlFor="senhaCadastroCooperado">Senha de acesso ao cadastro de cooperados (opcional)</Label>
                        <Input
                          id="senhaCadastroCooperado"
                          type="password"
                          value={senhaCadastroCooperado}
                          onChange={(e) => setSenhaCadastroCooperado(e.target.value)}
                          placeholder="Cooperado informará ao se cadastrar pelo CNPJ"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Se definir, o cooperado precisará informar esta senha ao criar a conta — além da senha pessoal de login dele.
                        </p>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                        {cloudStatus === "not_configured" ? (
                          <>
                            <p className="font-medium">Supabase não configurado neste servidor</p>
                            <p className="mt-1">
                              {cloudMessage ??
                                "Configure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY."}
                              {" "}
                              Na Vercel: Settings → Environment Variables → Redeploy.
                            </p>
                          </>
                        ) : cloudStatus === "migration_pending" ? (
                          <>
                            Antes de cadastrar, crie a tabela no Supabase (SQL Editor → arquivo{" "}
                            <strong>supabase/migrations/20260320120000_cooperativas.sql</strong>).
                            Veja <strong>SUPABASE_SETUP.md</strong> no projeto.
                          </>
                        ) : (
                          <>Após o cadastro, os cooperados poderão se registrar informando o CNPJ desta cooperativa.</>
                        )}
                      </div>

                      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}

                      <Button type="submit" className="w-full" size="lg" disabled={loading}>
                        {loading ? "Cadastrando..." : "Cadastrar Cooperativa e Entrar"}
                      </Button>
                    </form>
                  </>
                )}

                <p className="text-center text-sm text-gray-500 mt-6">
                  Já tem conta?{" "}
                  <Link href="/login" className="text-green-700 font-medium hover:text-green-800">
                    Fazer login
                  </Link>
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </GuestRoute>
  );
}
