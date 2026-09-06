"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { ContaCoopSegmentTabs } from "@/components/hb-credit/ContaCoopSegmentTabs";
import { consumeHbCreditScanResult } from "@/lib/hb-credit/scanSession";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  authorizeCreditPayment,
  fetchCreditAccount,
  fetchCreditLedger,
  setCreditFinancialPin,
  validateCreditQr,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopIntent, ContaCoopLedgerEntry, ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { refreshContaCoopValorReceberPilot } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { formatLedgerEntryLabel } from "@/lib/hb-credit/ledgerLabels";
import { getMesPrincipalQuantoVouReceber } from "@/services/cooperadoEntregasService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import { useSyncContaCoopValorReceberPilot } from "@/hooks/useSyncContaCoopValorReceberPilot";
import { useSyncContaCoopLimiteFromFicha } from "@/hooks/useSyncContaCoopLimiteFromFicha";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { cn } from "@/utils/format";

type Tab = "inicio" | "pagar" | "extrato";

export default function MinhaContaCoopPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate>
        <MinhaContaCoopContent />
      </CloudSessionGate>
    </CreditFeatureGate>
  );
}

function MinhaContaCoopContent() {
  const router = useRouter();
  const { user, cooperadoId } = usePermissions();
  const data = useAppData();
  const [tab, setTab] = useState<Tab>("inicio");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [account, setAccount] = useState<ContaCoopLimiteCooperado | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [ledger, setLedger] = useState<ContaCoopLedgerEntry[]>([]);
  const [pinSetup, setPinSetup] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [showManualQr, setShowManualQr] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<{
    intent: ContaCoopIntent;
    parceiroNome: string;
    limite: ContaCoopLimiteCooperado;
  } | null>(null);
  const [payPin, setPayPin] = useState("");
  const [useCashback, setUseCashback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const cnpj = useMemo(() => {
    if (!user || !data) return "";
    if (user.cooperativaCnpj) return normalizeCnpj(user.cooperativaCnpj);
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    return coop?.cnpj ? normalizeCnpj(coop.cnpj) : "";
  }, [user, data]);
  const cooperadoNome = useMemo(() => {
    if (!data || !cooperadoId) return user?.name ?? "";
    return data.cooperados.find((c) => c.id === cooperadoId)?.nomeCompleto ?? user?.name ?? "";
  }, [data, cooperadoId, user?.name]);

  const contaCoopSync = useMemo(() => {
    if (!data || !cooperadoId || !user || !cnpj) return undefined;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId || !isContaCoopValorReceberPilot(cooperadoId, cooperadoNome)) return undefined;
    return {
      cooperadoId,
      mesReferencia: getMesPrincipalQuantoVouReceber(data, cooperadoId, coopId),
      cooperativaId: coopId,
      cooperadoNome,
      user,
    };
  }, [cnpj, cooperadoId, cooperadoNome, data, user]);

  useSyncContaCoopValorReceberPilot(contaCoopSync);
  useSyncContaCoopLimiteFromFicha(contaCoopSync);

  useEffect(() => {
    const sync = () => setIsOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const reload = useCallback(async () => {
    if (!cnpj || !cooperadoId) return;
    setLoading(true);
    setError("");
    try {
      const acc = await fetchCreditAccount(cnpj, cooperadoId);
      setAccount((acc.account as ContaCoopLimiteCooperado) ?? null);
      setUpdatedAt(acc.updatedAt ?? null);
      setHasPin(Boolean((acc as { hasPin?: boolean }).hasPin));
      const lg = await fetchCreditLedger(cnpj, cooperadoId);
      setLedger(lg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar conta.");
    } finally {
      setLoading(false);
    }
  }, [cnpj, cooperadoId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const processarQr = useCallback(
    async (payload: string) => {
      if (!cnpj || !cooperadoId || !payload.trim()) return;
      setBusy(true);
      setError("");
      setSuccess("");
      setQrInput(payload.trim());
      setTab("pagar");
      try {
        const res = await validateCreditQr(cnpj, cooperadoId, payload.trim());
        if (res.intent && res.limite && res.parceiroNome) {
          setPendingIntent({ intent: res.intent, limite: res.limite, parceiroNome: res.parceiroNome });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Código inválido ou expirado.");
        setPendingIntent(null);
      } finally {
        setBusy(false);
      }
    },
    [cnpj, cooperadoId]
  );

  useEffect(() => {
    const payload = consumeHbCreditScanResult();
    if (payload) {
      void processarQr(payload);
    }
  }, [processarQr]);

  const salvarPin = async () => {
    if (!cnpj || !cooperadoId) return;
    setBusy(true);
    setError("");
    try {
      await setCreditFinancialPin(cnpj, cooperadoId, pinSetup);
      setHasPin(true);
      setPinSetup("");
      setSuccess("PIN cadastrado. Agora você pode pagar nos mercados parceiros.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar PIN.");
    } finally {
      setBusy(false);
    }
  };

  const confirmarPagamento = async () => {
    if (!pendingIntent || !cnpj || !cooperadoId) return;
    setBusy(true);
    setError("");
    try {
      const res = await authorizeCreditPayment({
        cnpj,
        cooperadoId,
        cooperadoNome,
        intentId: pendingIntent.intent.id,
        nonce: pendingIntent.intent.nonce,
        pin: payPin,
        idempotencyKey: `pay:${pendingIntent.intent.id}:${cooperadoId}`,
        useCashback,
      });
      setSuccess(`Pagamento aprovado! Comprovante ${res.receiptCode}`);
      setPendingIntent(null);
      setQrInput("");
      setPayPin("");
      setUseCashback(false);
      setTab("extrato");
      await reload();
      if (contaCoopSync) {
        await refreshContaCoopValorReceberPilot({
          cnpj,
          cooperadoId: contaCoopSync.cooperadoId,
          mesReferencia: contaCoopSync.mesReferencia,
          cooperativaId: contaCoopSync.cooperativaId,
          cooperadoNome: contaCoopSync.cooperadoNome,
        }).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pagamento recusado.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !account) return <PageSkeleton />;

  const disponivel = account?.valorDisponivelCents ?? 0;
  const cashback = account?.cashbackDisponivelCents ?? 0;
  const limite = account?.limiteLiberadoCents ?? 0;
  const usado = account?.valorUsadoCents ?? 0;
  const usoPercent = limite > 0 ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
  const pagamentoBloqueado = !hasPin || account?.bloqueado || isOffline;
  const effectiveDisponivel = disponivel + (useCashback ? cashback : 0);
  const creditDebitPreview = pendingIntent
    ? Math.max(0, pendingIntent.intent.amountCents - (useCashback ? Math.min(cashback, pendingIntent.intent.amountCents) : 0))
    : 0;

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-700">HB Créditos</p>
        <h1 className="text-2xl font-bold text-gray-900">Seu crédito interno</h1>
        <p className="text-sm text-gray-500">Use nas lojas parceiras da cooperativa</p>
      </header>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && (
        <AlertBanner variant="info" title="Tudo certo">
          {success}
        </AlertBanner>
      )}
      {account?.bloqueado && (
        <AlertBanner variant="warning" title="Conta pausada">
          Pagamentos suspensos. Entre em contato com a cooperativa.
        </AlertBanner>
      )}
      {isOffline && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          Sem internet — valores podem estar desatualizados
        </div>
      )}

      <ContaCoopSegmentTabs
        tabs={[
          { id: "inicio", label: "Início" },
          { id: "pagar", label: "Pagar" },
          { id: "extrato", label: "Extrato" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "inicio" && (
        <>
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-green-800 via-green-700 to-emerald-600 p-6 text-white shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-green-100">Disponível para usar</p>
                <p className="mt-1 text-4xl font-bold tracking-tight">{formatCentsBRL(disponivel)}</p>
              </div>
              {cashback > 0 && (
                <div className="rounded-2xl bg-white/15 px-3 py-2 text-right backdrop-blur-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-green-100">Cashback</p>
                  <p className="text-lg font-bold">{formatCentsBRL(cashback)}</p>
                </div>
              )}
            </div>
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-xs text-green-100">
                <span>Usado {formatCentsBRL(usado)}</span>
                <span>Limite {formatCentsBRL(limite)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-green-900/40">
                <div
                  className="h-full rounded-full bg-white/90 transition-all"
                  style={{ width: `${usoPercent}%` }}
                />
              </div>
            </div>
            {updatedAt && (
              <p className="mt-4 text-xs text-green-200/80">
                Atualizado {new Date(updatedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="!p-4 text-center">
              <p className="text-xs text-gray-500">Crédito liberado</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatCentsBRL(limite)}</p>
            </Card>
            <Card className="!p-4 text-center">
              <p className="text-xs text-gray-500">Já utilizado</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{formatCentsBRL(usado)}</p>
            </Card>
          </div>

          {!hasPin ? (
            <Card className="space-y-4 border-amber-200 bg-amber-50/40 !p-5">
              <div>
                <h3 className="font-semibold text-gray-900">Crie seu PIN de pagamento</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Você precisa de um PIN numérico para autorizar compras nos mercados.
                </p>
              </div>
              <div>
                <Label>PIN ({FINANCIAL_PIN_MIN_LENGTH} a 8 dígitos)</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pinSetup}
                  onChange={(e) => setPinSetup(e.target.value.replace(/\D/g, ""))}
                  maxLength={8}
                  className="mt-1 text-lg tracking-widest"
                  placeholder="••••"
                />
              </div>
              <Button
                className="w-full"
                onClick={salvarPin}
                disabled={busy || pinSetup.length < FINANCIAL_PIN_MIN_LENGTH}
              >
                Cadastrar PIN
              </Button>
            </Card>
          ) : (
            <Button size="lg" className="w-full" onClick={() => router.push("/minha-conta-coop/escanear")} disabled={account?.bloqueado}>
              Pagar com QR Code
            </Button>
          )}
        </>
      )}

      {tab === "pagar" && (
        <div className="space-y-4">
          {!hasPin ? (
            <Card className="!p-5 text-center text-sm text-gray-600">
              Cadastre seu PIN na aba Início antes de pagar.
              <Button variant="secondary" className="mt-3 w-full" onClick={() => setTab("inicio")}>
                Ir para Início
              </Button>
            </Card>
          ) : pendingIntent ? (
            <Card className="space-y-4 border-green-300 bg-green-50/60 !p-5">
              <div className="text-center">
                <p className="text-sm text-gray-600">Pagando em</p>
                <p className="text-xl font-bold text-gray-900">{pendingIntent.parceiroNome}</p>
                <p className="mt-2 text-3xl font-bold text-green-800">
                  {formatCentsBRL(pendingIntent.intent.amountCents)}
                </p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Valor da compra</span>
                  <span className="font-medium">{formatCentsBRL(pendingIntent.intent.amountCents)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Crédito disponível</span>
                  <span>{formatCentsBRL(pendingIntent.limite.valorDisponivelCents)}</span>
                </div>
                {(pendingIntent.limite.cashbackDisponivelCents ?? 0) > 0 && (
                  <div className="flex justify-between py-1 text-green-800">
                    <span>Cashback disponível</span>
                    <span>{formatCentsBRL(pendingIntent.limite.cashbackDisponivelCents ?? 0)}</span>
                  </div>
                )}
                {useCashback && (pendingIntent.limite.cashbackDisponivelCents ?? 0) > 0 && (
                  <div className="flex justify-between py-1 text-green-800">
                    <span>Cashback aplicado</span>
                    <span>
                      −
                      {formatCentsBRL(
                        Math.min(pendingIntent.limite.cashbackDisponivelCents ?? 0, pendingIntent.intent.amountCents)
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 font-semibold text-green-800">
                  <span>Crédito após pagamento</span>
                  <span>
                    {formatCentsBRL(pendingIntent.limite.valorDisponivelCents - creditDebitPreview)}
                  </span>
                </div>
              </div>
              {(pendingIntent.limite.cashbackDisponivelCents ?? 0) > 0 && (
                <Button
                  type="button"
                  variant={useCashback ? "primary" : "secondary"}
                  className="w-full"
                  onClick={() => setUseCashback((v) => !v)}
                  disabled={busy}
                >
                  {useCashback ? "Cashback somado ao pagamento ✓" : "Usar cashback neste pagamento"}
                </Button>
              )}
              <div>
                <Label>Digite seu PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={payPin}
                  onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ""))}
                  maxLength={8}
                  className="mt-1 text-center text-2xl tracking-[0.4em]"
                  placeholder="••••"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setPendingIntent(null)} disabled={busy}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={confirmarPagamento}
                  disabled={
                    busy ||
                    payPin.length < FINANCIAL_PIN_MIN_LENGTH ||
                    effectiveDisponivel < pendingIntent.intent.amountCents
                  }
                >
                  Confirmar
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4 !p-5">
              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">Escaneie o QR Code gerado no mercado parceiro.</p>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => router.push("/minha-conta-coop/escanear")}
                  disabled={pagamentoBloqueado || busy}
                >
                  Abrir câmera para pagar
                </Button>
              </div>

              <button
                type="button"
                className="w-full text-center text-sm font-medium text-green-700 underline-offset-2 hover:underline"
                onClick={() => setShowManualQr((v) => !v)}
              >
                {showManualQr ? "Ocultar colar código" : "Colar código manualmente"}
              </button>

              {showManualQr && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <Label>Código do QR (hb-credit://…)</Label>
                  <Input
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="hb-credit://pay/..."
                  />
                  <Button
                    className="w-full"
                    onClick={() => void processarQr(qrInput)}
                    disabled={busy || pagamentoBloqueado || !qrInput.trim()}
                  >
                    Verificar cobrança
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "extrato" && (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-900">Movimentações</h3>
            <p className="text-xs text-gray-500">Pagamentos e ajustes do seu crédito</p>
          </div>
          <div className="divide-y divide-gray-100">
            {ledger.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{formatLedgerEntryLabel(entry)}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p>
                  {entry.memo && String(entry.tipo) !== "PAYMENT" && (
                    <p className="truncate text-xs text-gray-400">{entry.memo}</p>
                  )}
                  {entry.memo && String(entry.tipo) === "PAYMENT" && !/^\d+$/.test(entry.memo.trim()) && (
                    <p className="truncate text-xs text-gray-400">{entry.memo}</p>
                  )}
                </div>
                <p
                  className={cn(
                    "shrink-0 text-base font-semibold tabular-nums",
                    entry.amountCents < 0 ? "text-red-600" : "text-green-700"
                  )}
                >
                  {formatCentsBRL(entry.amountCents)}
                </p>
              </div>
            ))}
            {!ledger.length && (
              <p className="px-5 py-10 text-center text-sm text-gray-500">Nenhuma movimentação ainda.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
