"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  requestCooperadoPinReset,
  setCreditFinancialPin,
  validateCreditQr,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { ContaCoopIntent, ContaCoopLedgerEntry, ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { formatLedgerEntryLabel } from "@/lib/hb-credit/ledgerLabels";
import { bicCentralMesPrincipalQuantoVouReceber } from "@/services/bicLeituraCentralCooperado";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import { notifyHbCreditAccountLoaded } from "@/lib/hb-credit/hbCreditEntryEvents";
import { HB_CREDIT_LIMITE_SYNCED_EVENT } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import {
  aplicarHbCreditAccountPersistido,
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
  lerHbCreditAccountPersistido,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { useSyncContaCoopValorReceberPilot } from "@/hooks/useSyncContaCoopValorReceberPilot";
import { useSyncContaCoopLimiteFromFicha } from "@/hooks/useSyncContaCoopLimiteFromFicha";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { cn } from "@/utils/format";

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type Tab = "inicio" | "pagar" | "extrato";

export default function MinhaContaCoopPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate optimistic>
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
  const [tabEverOpened, setTabEverOpened] = useState<Partial<Record<Tab, boolean>>>({ inicio: true });

  const handleTabChange = useCallback((next: Tab) => {
    setTabEverOpened((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
    setTab(next);
  }, []);

  const tabPanelHidden = useCallback((id: Tab) => (id !== tab ? "hidden" : undefined), [tab]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [account, setAccount] = useState<ContaCoopLimiteCooperado | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pinResetPending, setPinResetPending] = useState(false);
  const [ledger, setLedger] = useState<ContaCoopLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
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
  const [accountRefreshing, setAccountRefreshing] = useState(false);
  /** Aux syncs (ficha / limite) só após o primeiro fetchCreditAccount — não competem na entrada. */
  const [auxSyncEnabled, setAuxSyncEnabled] = useState(false);
  const auxEntrySignaledRef = useRef(false);

  /** Sync-limite na nuvem após conta carregar — alinhado ao BIC sem bloquear a abertura. */
  const LIMITE_SYNC_DEFER_MS = 2_000;
  const VALOR_RECEBER_SYNC_DEFER_MS = 1_500;

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

  const contaCoopValorSync = useMemo(() => {
    if (!auxSyncEnabled || !data || !cooperadoId || !user || !cnpj) return undefined;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId || !isContaCoopValorReceberPilot(cooperadoId, cooperadoNome)) return undefined;
    return {
      cooperadoId,
      mesReferencia: bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, coopId),
      cooperativaId: coopId,
      cooperadoNome,
      user,
      enabled: true as const,
    };
  }, [auxSyncEnabled, cnpj, cooperadoId, cooperadoNome, data, user]);

  const contaCoopLimiteSync = useMemo(() => {
    if (!contaCoopValorSync) return undefined;
    return {
      ...contaCoopValorSync,
      initialDelayMs: LIMITE_SYNC_DEFER_MS,
    };
  }, [contaCoopValorSync]);

  useSyncContaCoopValorReceberPilot(
    contaCoopValorSync ? { ...contaCoopValorSync, initialDelayMs: VALOR_RECEBER_SYNC_DEFER_MS } : undefined
  );
  useSyncContaCoopLimiteFromFicha(contaCoopLimiteSync);

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

  const loadLedger = useCallback(async () => {
    if (!cnpj || !cooperadoId) return;
    setLedgerLoading(true);
    try {
      const lg = await fetchCreditLedger(cnpj, cooperadoId);
      setLedger(lg);
      setLedgerLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar extrato.");
    } finally {
      setLedgerLoading(false);
    }
  }, [cnpj, cooperadoId]);

  const reload = useCallback(async (opts?: { background?: boolean }) => {
    if (!cnpj || !cooperadoId) return;
    const background = opts?.background ?? false;
    if (!background) setLoading(true);
    else setAccountRefreshing(true);
    if (!background) setLedgerLoaded(false);
    setError("");
    try {
      const acc = await fetchCreditAccount(cnpj, cooperadoId);
      const accObj = (acc.account as ContaCoopLimiteCooperado) ?? null;
      setAccount(accObj);
      setUpdatedAt(acc.updatedAt ?? null);
      setHasPin(Boolean(acc.hasPin));
      setPinResetPending(Boolean(acc.pinResetPending));
      gravarHbCreditAccountPersistido(cnpj, cooperadoId, {
        v: HB_CREDIT_ACCOUNT_STORAGE_VERSION,
        account: accObj,
        updatedAt: acc.updatedAt ?? null,
        hasPin: Boolean(acc.hasPin),
        pinResetPending: Boolean(acc.pinResetPending),
        savedAt: new Date().toISOString(),
      });
    } catch (e) {
      if (!background) {
        setError(e instanceof Error ? e.message : "Erro ao carregar conta.");
      }
    } finally {
      setLoading(false);
      setAccountRefreshing(false);
      if (!auxEntrySignaledRef.current) {
        auxEntrySignaledRef.current = true;
        setAuxSyncEnabled(true);
        notifyHbCreditAccountLoaded();
      }
    }
  }, [cnpj, cooperadoId]);

  useEffect(() => {
    if (!cnpj || !cooperadoId) return;
    const snap = lerHbCreditAccountPersistido(cnpj, cooperadoId);
    let background = false;
    if (snap?.account) {
      const applied = aplicarHbCreditAccountPersistido(snap);
      setAccount(applied.account);
      setUpdatedAt(applied.updatedAt);
      setHasPin(applied.hasPin);
      setPinResetPending(applied.pinResetPending);
      setLoading(false);
      background = true;
      if (!auxEntrySignaledRef.current) {
        auxEntrySignaledRef.current = true;
        setAuxSyncEnabled(true);
        notifyHbCreditAccountLoaded();
      }
    }
    void reload({ background });
  }, [cnpj, cooperadoId, reload]);

  useEffect(() => {
    const onLimiteSynced = () => {
      void reload({ background: true });
    };
    window.addEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
    return () => window.removeEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
  }, [reload]);

  useEffect(() => {
    if (tab !== "extrato" || ledgerLoaded || ledgerLoading) return;
    if (!cnpj || !cooperadoId) return;
    void loadLedger();
  }, [tab, ledgerLoaded, ledgerLoading, cnpj, cooperadoId, loadLedger]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload({ background: true });
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
      setTabEverOpened((prev) => ({ ...prev, pagar: true }));
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
      setPinResetPending(false);
      setPinSetup("");
      setSuccess("PIN cadastrado. Agora você pode pagar nos mercados parceiros.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar PIN.");
    } finally {
      setBusy(false);
    }
  };

  const solicitarResetPin = async () => {
    if (!cnpj || !cooperadoId) return;
    const msg =
      "Solicitar reset do PIN de pagamento?\n\n" +
      "O responsável da cooperativa receberá o pedido em Conta Coop → Limites e precisará confirmar o reset. " +
      "Depois você cadastra um PIN novo aqui.";
    if (!window.confirm(msg)) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = await requestCooperadoPinReset(cnpj, cooperadoId);
      setPinResetPending(true);
      setSuccess(data.message ?? "Solicitação enviada à cooperativa.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao solicitar reset do PIN.");
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
        cooperativaId: contaCoopValorSync?.cooperativaId,
        mesReferencia: contaCoopValorSync?.mesReferencia,
        intentId: pendingIntent.intent.id,
        nonce: pendingIntent.intent.nonce,
        pin: payPin,
        idempotencyKey: `pay:${pendingIntent.intent.id}:${cooperadoId}`,
        useCashback,
      });
      setSuccess(
        res.syncContaCoop === "pending"
          ? `Pagamento aprovado! Comprovante ${res.receiptCode}. O valor a receber pode levar alguns instantes para atualizar.`
          : `Pagamento aprovado! Comprovante ${res.receiptCode}`
      );
      setPendingIntent(null);
      setQrInput("");
      setPayPin("");
      setUseCashback(false);
      handleTabChange("extrato");
      await reload({ background: false });
      if (res.syncContaCoop === "pending") {
        await sleepMs(400);
        await reload({ background: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pagamento recusado.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !account) {
    return (
      <div className="mx-auto max-w-lg space-y-3 pb-8">
        <PageSkeleton />
        <p className="text-center text-xs text-gray-500">Carregando HB Créditos…</p>
      </div>
    );
  }

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
        onChange={handleTabChange}
      />

      {tabEverOpened.inicio && (
        <div className={tabPanelHidden("inicio")}>
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-green-800 via-green-700 to-emerald-600 p-4 text-white shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-green-100">Disponível para usar</p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight">{formatCentsBRL(disponivel)}</p>
              </div>
              {cashback > 0 && (
                <div className="rounded-xl bg-white/15 px-2.5 py-1.5 text-right backdrop-blur-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-green-100">Cashback</p>
                  <p className="text-sm font-bold">{formatCentsBRL(cashback)}</p>
                </div>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
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
              <p className="mt-2 text-[11px] text-green-200/80">
                Atualizado {new Date(updatedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Card className="!p-3 text-center">
              <p className="text-[11px] text-gray-500">Crédito liberado</p>
              <p className="mt-0.5 text-base font-bold text-gray-900">{formatCentsBRL(limite)}</p>
            </Card>
            <Card className="!p-3 text-center">
              <p className="text-[11px] text-gray-500">Já utilizado</p>
              <p className="mt-0.5 text-base font-bold text-gray-900">{formatCentsBRL(usado)}</p>
            </Card>
          </div>

          {!hasPin ? (
            <Card className="space-y-3 border-amber-200 bg-amber-50/40 !p-4">
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
              {pinResetPending && (
                <p className="text-sm text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2">
                  Solicitação de reset enviada. Aguarde o responsável em Conta Coop → Limites.
                </p>
              )}
            </Card>
          ) : (
            <>
              <Button size="lg" className="w-full" onClick={() => router.push("/minha-conta-coop/escanear")} disabled={account?.bloqueado}>
                Pagar com QR Code
              </Button>
              {pinResetPending ? (
                <p className="text-sm text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2">
                  Solicitação de reset enviada. Aguarde o responsável da cooperativa em Conta Coop → Limites.
                </p>
              ) : (
                <Button variant="secondary" className="w-full" onClick={() => void solicitarResetPin()} disabled={busy}>
                  Esqueci meu PIN — solicitar reset
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {tabEverOpened.pagar && (
        <div className={cn("space-y-4", tabPanelHidden("pagar"))}>
          {!hasPin ? (
            <Card className="!p-5 text-center text-sm text-gray-600">
              Cadastre seu PIN na aba Início antes de pagar.
              <Button variant="secondary" className="mt-3 w-full" onClick={() => handleTabChange("inicio")}>
                Ir para Início
              </Button>
            </Card>
          ) : pendingIntent ? (
            <Card className="space-y-3 border-green-300 bg-green-50/60 !p-4">
              <div className="text-center">
                <p className="text-xs text-gray-600">Pagando em</p>
                <p className="text-lg font-bold text-gray-900">{pendingIntent.parceiroNome}</p>
                <p className="mt-1 text-2xl font-bold text-green-800">
                  {formatCentsBRL(pendingIntent.intent.amountCents)}
                </p>
              </div>
              <div className="rounded-lg bg-white/80 p-2.5 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Mercado parceiro</span>
                  <span className="font-medium text-right">{pendingIntent.parceiroNome}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Valor da compra</span>
                  <span className="font-medium">{formatCentsBRL(pendingIntent.intent.amountCents)}</span>
                </div>
                <div className="flex justify-between py-1 text-xs text-gray-500">
                  <span>Código da cobrança</span>
                  <span className="font-mono truncate max-w-[55%] text-right" title={pendingIntent.intent.id}>
                    {pendingIntent.intent.id.slice(-12)}
                  </span>
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
                <p className="mt-2 text-xs text-gray-500">
                  Esqueceu o PIN? Use <strong>Esqueci meu PIN — solicitar reset</strong> na aba Início.
                </p>
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

      {tabEverOpened.extrato && (
        <div className={tabPanelHidden("extrato")}>
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-900">Movimentações</h3>
            <p className="text-xs text-gray-500">Pagamentos e ajustes do seu crédito</p>
          </div>
          {ledgerLoading && !ledgerLoaded ? (
            <div className="px-5 py-10">
              <PageSkeleton />
            </div>
          ) : (
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
          )}
        </Card>
        </div>
      )}
    </div>
  );
}
