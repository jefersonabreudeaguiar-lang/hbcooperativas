"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Save, CheckCircle2, Wallet, AlertCircle } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/Table";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { getMesQuantoVouReceber } from "@/services/cooperadoEntregasService";
import { getStatusCotaCooperado } from "@/services/notaPedidoService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { formatCPFCNPJ, formatPhone, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { getUserCooperativaId, getUserCooperativaNome } from "@/utils/cooperativa";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { AssinaturaCadastroPanel } from "@/components/cooperado/AssinaturaCadastroPanel";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import { cooperadoPrecisaCadastrarAssinatura } from "@/services/cooperadoAssinaturaService";

export default function MeuCadastroContent() {
  const data = useAppData();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNovo = searchParams.get("novo") === "1";

  const [chavePix, setChavePix] = useState("");
  const [saved, setSaved] = useState(false);
  const [pixError, setPixError] = useState("");
  const pixDirtyRef = useRef(false);
  const loadedForCooperadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && (user.role !== "cooperado" || !user.cooperadoId)) router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => {
    if (!data || !user?.cooperadoId) return;
    const c = data.cooperados.find((x) => x.id === user.cooperadoId);
    if (!c) return;

    if (loadedForCooperadoRef.current !== user.cooperadoId) {
      loadedForCooperadoRef.current = user.cooperadoId;
      pixDirtyRef.current = false;
      setChavePix(c.chavePix ?? "");
      return;
    }

    if (pixDirtyRef.current) return;

    setChavePix(c.chavePix ?? "");
  }, [data, user?.cooperadoId]);

  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const cooperadoId = user?.cooperadoId;

  const mesReferencia = useMemo(() => {
    if (!data || !cooperadoId) return getCurrentMesReferencia();
    return getMesQuantoVouReceber(data, cooperadoId, coopId);
  }, [data, cooperadoId, coopId]);

  const statusCota = useMemo(() => {
    if (!data || !cooperadoId) return "nao_paga" as const;
    return getStatusCotaCooperado(data, cooperadoId, mesReferencia);
  }, [data, cooperadoId, mesReferencia]);

  if (!data || !user || user.role !== "cooperado" || !user.cooperadoId) return null;

  const cooperado = data.cooperados.find((c) => c.id === user.cooperadoId);
  if (!cooperado) return <p className="text-gray-500">Cadastro não encontrado.</p>;

  const precisaPix = cooperadoPrecisaCadastrarPix(cooperado.chavePix, cooperado.pixValido);

  const handleSavePix = async () => {
    if (!chavePix.trim()) {
      setPixError("Informe sua chave PIX.");
      return;
    }
    if (chavePix.trim().length < 5) {
      setPixError("Chave muito curta. Use CPF, celular, e-mail ou chave do banco.");
      return;
    }
    if (!user) return;
    setPixError("");
    const now = new Date().toISOString();
    const cooperadoAtualizado: typeof cooperado = {
      ...cooperado,
      chavePix: chavePix.trim(),
      pixValido: true,
      pixInvalidoMotivo: undefined,
      updatedAt: now,
    };

    updateData((d) => {
      const updated = {
        ...d,
        cooperados: d.cooperados.map((c) =>
          c.id === cooperado.id ? cooperadoAtualizado : c
        ),
      };
      return addAuditEntry(updated, {
        entityType: "cooperado", entityId: cooperado.id, action: "editar",
        userId: user.id, userName: user.name, changes: "PIX atualizado",
      });
    });

    const coopId = getUserCooperativaId(user, data);
    const cnpj = await resolveCooperativaCnpj(data, coopId, user);
    if (cnpj) void pushCooperadoToCloud(cnpj, cooperadoAtualizado, user.email);

    pixDirtyRef.current = false;
    setSaved(true);
    if (isNovo) {
      router.replace("/notas-pedido?anexar=1");
      return;
    }
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Meu cadastro" subtitle="Seus dados e chave para receber pagamentos" />

      {statusCota === "paga" ? (
        <AlertBanner variant="success" className="mb-6" title="Cota paga">
          <CheckCircle2 size={18} className="inline mr-1" />
          Sua cota de ingresso está em dia · {formatMesReferencia(mesReferencia)}.
        </AlertBanner>
      ) : (
        <AlertBanner variant="warning" className="mb-6" title="Cota pendente">
          <AlertCircle size={18} className="inline mr-1" />
          Sua cota de ingresso ainda não está quitada. Regularize com a cooperativa ou consulte em{" "}
          <Link href="/cotas" className="font-semibold underline">Cotas</Link>.
        </AlertBanner>
      )}

      {(precisaPix || isNovo) && (
        <AlertBanner variant="warning" title="Informe onde quer receber" className="mb-6">
          {cooperado.pixInvalidoMotivo ?? "Cadastre sua chave PIX para a cooperativa poder pagar você."}
        </AlertBanner>
      )}

      {cooperadoUsaAssinaturaCadastroPilot(cooperado.id) &&
        cooperadoPrecisaCadastrarAssinatura(cooperado.id, cooperado) && (
          <AlertBanner variant="warning" title="Adicione sua assinatura" className="mb-6">
            Fotografe sua assinatura no papel uma vez. Ela será usada em votações, atas e recibos.
          </AlertBanner>
        )}

      <AssinaturaCadastroPanel data={data} user={user} cooperado={cooperado} />

      {!precisaPix && (
        <AlertBanner variant="success" className="mb-6">
          <CheckCircle2 size={18} className="inline mr-1" /> PIX cadastrado: <strong>{cooperado.chavePix}</strong>
        </AlertBanner>
      )}

      <Card title="Chave PIX" className="mb-6">
        <FormField
          label="Onde você quer receber?"
          required
          error={pixError}
          hint="Pode ser CPF, celular (com DDD), e-mail ou chave aleatória do seu banco."
        >
          <Input
            value={chavePix}
            onChange={(e) => {
              pixDirtyRef.current = true;
              setChavePix(e.target.value);
              setPixError("");
            }}
            placeholder="Ex: 11999998888 ou seu@email.com"
          />
        </FormField>
        <Button className="mt-4 w-full sm:w-auto" size="lg" onClick={handleSavePix}>
          <Save size={18} /> {saved ? "Salvo com sucesso!" : "Salvar minha chave PIX"}
        </Button>
      </Card>

      <Card title="Seus dados">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {[
            ["Cooperativa", getUserCooperativaNome(user, data)],
            ["Nome", cooperado.nomeCompleto],
            ["CPF/CNPJ", formatCPFCNPJ(cooperado.cpfCnpj)],
            ["Telefone", formatPhone(cooperado.telefone)],
            ["Comunidade", cooperado.comunidade],
            [
              "Cota de ingresso",
              statusCota === "paga" ? (
                <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                  <CheckCircle2 size={14} /> Paga
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                  <AlertCircle size={14} /> Pendente
                </span>
              ),
            ],
            ["Status", <StatusBadge key="s" status={cooperado.status} />],
          ].map(([label, value]) => (
            <div key={String(label)} className="py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 uppercase">{label}</p>
              <p className="mt-1 text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link href="/notas-pedido?anexar=1" className="flex-1">
          <Button variant="secondary" className="w-full" size="lg">Enviar foto da entrega</Button>
        </Link>
        <Link href="/ficha-corrida" className="flex-1">
          <Button variant="secondary" className="w-full" size="lg"><Wallet size={18} /> Ver quanto vou receber</Button>
        </Link>
      </div>
    </div>
  );
}
