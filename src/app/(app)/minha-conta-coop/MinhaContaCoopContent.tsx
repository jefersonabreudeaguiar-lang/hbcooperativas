"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { ContaCoopSegmentTabs } from "@/components/hb-credit/ContaCoopSegmentTabs";
import { prepareAndOpenHbCreditPaymentFromQrScan } from "@/lib/hb-credit/openHbCreditPaymentFromQr";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  convertCreditCashbackToReceivable,
  createCooperadoReceberIntent,
  fetchCreditAccount,
  fetchCreditLedger,
  requestCooperadoPinReset,
  setCreditFinancialPin,
} from "@/services/creditApiService";
import { isCooperadoTransferenciaCreditoEnabled } from "@/config/cooperadoTransferenciaCredito";
import {
  storeHbCreditCooperadoReceberDraft,
} from "@/lib/hb-credit/hbCreditCooperadoReceberDraft";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { round2 } from "@/utils/calculations";
import { getData, updateData } from "@/services/dataStore";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import {
  CASHBACK_HB_CREDITO_MOTIVO_AVULSO,
  criarValorAvulsoReceber,
  temCashbackHbCreditoPendenteMes,
} from "@/services/valoresAvulsosReceberService";
import type { ContaCoopLedgerEntry, ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { formatLedgerEntryLabel } from "@/lib/hb-credit/ledgerLabels";
import { bicCentralMesPrincipalQuantoVouReceber } from "@/services/bicLeituraCentralCooperado";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import { notifyHbCreditAccountLoaded } from "@/lib/hb-credit/hbCreditEntryEvents";
import { HB_CREDIT_LIMITE_SYNCED_EVENT, notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import {
  aplicarHbCreditAccountPersistido,
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
  lerHbCreditAccountPersistido,
  lerHbCreditAccountPersistidoFlex,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { useSyncContaCoopValorReceberPilot } from "@/hooks/useSyncContaCoopValorReceberPilot";
import { useHbCreditAccountRevisionPoll } from "@/hooks/useHbCreditAccountRevisionPoll";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { cn } from "@/utils/format";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import {
  gravarHbCreditLedgerPersistido,
  lerHbCreditLedgerPersistido,
} from "@/lib/hb-credit/hbCreditLedgerPersistencia";

type Tab = "inicio" | "pagar" | "receber" | "extrato";

function parseValorHbReais(raw: string): number {
  const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

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
  const [busy, setBusy] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [accountRefreshing, setAccountRefreshing] = useState(false);
  /** Aux syncs (ficha) só após o primeiro fetchCreditAccount — limite vem da nuvem + poll (aba Limites do responsável). */
  const [auxSyncEnabled, setAuxSyncEnabled] = useState(false);
  const auxEntrySignaledRef = useRef(false);
  const createReceberIdempotencyRef = useRef<string | null>(null);
  const [valorReceberReais, setValorReceberReais] = useState("");
  const [descricaoReceber, setDescricaoReceber] = useState("");

  const transferenciaCooperadoAtiva = isCooperadoTransferenciaCreditoEnabled();

  const VALOR_RECEBER_SYNC_DEFER_MS = 1_500;

  const hbApiCooperadoId = useMemo(
    () => resolveHbCreditApiCooperadoId(user, cooperadoId),
    [user, cooperadoId]
  );

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

  const mesReferenciaReceber = useMemo(() => {
    if (!data || !cooperadoId || !user) return "";
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return "";
    return bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, coopId);
  }, [data, cooperadoId, user]);

  const cashbackJaNaFicha = useMemo(() => {
    if (!data || !cooperadoId || !mesReferenciaReceber) return false;
    const coopId = user ? getUserCooperativaId(user, data) : undefined;
    return temCashbackHbCreditoPendenteMes(data, cooperadoId, mesReferenciaReceber, coopId);
  }, [data, cooperadoId, mesReferenciaReceber, user]);

  const segmentTabs = useMemo(() => {
    const tabs: { id: Tab; label: string }[] = [
      { id: "inicio", label: "Início" },
      { id: "pagar", label: "Pagar" },
    ];
    if (transferenciaCooperadoAtiva) {
      tabs.push({ id: "receber", label: "Receber" });
    }
    tabs.push({ id: "extrato", label: "Extrato" });
    return tabs;
  }, [transferenciaCooperadoAtiva]);

  useSyncContaCoopValorReceberPilot(
    contaCoopValorSync ? { ...contaCoopValorSync, initialDelayMs: VALOR_RECEBER_SYNC_DEFER_MS } : undefined
  );

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

  const loadLedger = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!cnpj || !hbApiCooperadoId) return;
      const cached = lerHbCreditLedgerPersistido(cnpj, hbApiCooperadoId);
      if (cached?.length) {
        setLedger(cached);
        setLedgerLoaded(true);
      }
      const showBlockingLoader = !cached?.length && !opts?.background;
      if (showBlockingLoader) setLedgerLoading(true);
      try {
        const lg = await fetchCreditLedger(cnpj, hbApiCooperadoId);
        setLedger(lg);
        setLedgerLoaded(true);
        gravarHbCreditLedgerPersistido(cnpj, hbApiCooperadoId, lg);
      } catch (e) {
        if (!cached?.length) {
          setError(e instanceof Error ? e.message : "Erro ao carregar extrato.");
        }
      } finally {
        if (showBlockingLoader) setLedgerLoading(false);
      }
    },
    [cnpj, hbApiCooperadoId]
  );

  const reload = useCallback(async (opts?: { background?: boolean }) => {
    if (!cnpj || !hbApiCooperadoId) return;
    const background = opts?.background ?? false;
    if (!background) setLoading(true);
    else setAccountRefreshing(true);
    if (!background) setLedgerLoaded(false);
    setError("");
    try {
      const acc = await fetchCreditAccount(cnpj, hbApiCooperadoId);
      const accObj = (acc.account as ContaCoopLimiteCooperado) ?? null;
      const emptyShell =
        accObj &&
        (accObj.limiteLiberadoCents ?? 0) <= 0 &&
        (accObj.valorDisponivelCents ?? 0) <= 0 &&
        !acc.hasPin;
      if (emptyShell) {
        throw new Error("Conta HB não encontrada. Saia e entre de novo ou atualize a página.");
      }
      setAccount(accObj);
      setUpdatedAt(acc.updatedAt ?? null);
      setHasPin(Boolean(acc.hasPin));
      setPinResetPending(Boolean(acc.pinResetPending));
      gravarHbCreditAccountPersistido(cnpj, hbApiCooperadoId, {
        v: HB_CREDIT_ACCOUNT_STORAGE_VERSION,
        account: accObj,
        updatedAt: acc.updatedAt ?? null,
        hasPin: Boolean(acc.hasPin),
        pinResetPending: Boolean(acc.pinResetPending),
        savedAt: new Date().toISOString(),
      });
      notifyHbCreditAccountCacheUpdated();
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
  }, [cnpj, hbApiCooperadoId]);

  useEffect(() => {
    if (!cnpj || !hbApiCooperadoId) return;
    const cachedLedger = lerHbCreditLedgerPersistido(cnpj, hbApiCooperadoId);
    if (cachedLedger?.length) {
      setLedger(cachedLedger);
      setLedgerLoaded(true);
    }
    const snap =
      lerHbCreditAccountPersistido(cnpj, hbApiCooperadoId) ??
      lerHbCreditAccountPersistidoFlex(hbApiCooperadoId, cnpj) ??
      (cooperadoId && cooperadoId !== hbApiCooperadoId
        ? lerHbCreditAccountPersistido(cnpj, cooperadoId) ??
          lerHbCreditAccountPersistidoFlex(cooperadoId, cnpj)
        : null);
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
  }, [cnpj, hbApiCooperadoId, cooperadoId, reload]);

  useEffect(() => {
    const onLimiteSynced = () => {
      void reload({ background: true });
      void loadLedger({ background: true });
    };
    window.addEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
    return () => window.removeEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
  }, [reload, loadLedger]);

  useHbCreditAccountRevisionPoll({
    cnpj,
    cooperadoId: hbApiCooperadoId ?? "",
    enabled: auxSyncEnabled && Boolean(cnpj && hbApiCooperadoId),
    onRevisionChange: () => {
      void reload({ background: true });
    },
  });

  useEffect(() => {
    if (!auxSyncEnabled || !cnpj || !hbApiCooperadoId) return;
    void loadLedger({ background: true });
  }, [auxSyncEnabled, cnpj, hbApiCooperadoId, loadLedger]);

  useEffect(() => {
    if (tab !== "extrato" || ledgerLoaded || ledgerLoading) return;
    if (!cnpj || !hbApiCooperadoId) return;
    void loadLedger();
  }, [tab, ledgerLoaded, ledgerLoading, cnpj, hbApiCooperadoId, loadLedger]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload({ background: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const processarQr = useCallback(
    (payload: string) => {
      if (!cnpj || !hbApiCooperadoId || !payload.trim()) return;
      setError("");
      setSuccess("");
      try {
        prepareAndOpenHbCreditPaymentFromQrScan(router, {
          cnpj,
          cooperadoId: hbApiCooperadoId,
          qrPayload: payload.trim(),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Código inválido ou expirado.");
      }
    },
    [cnpj, hbApiCooperadoId, router]
  );

  const salvarPin = async () => {
    if (!cnpj || !hbApiCooperadoId) return;
    setBusy(true);
    setError("");
    try {
      await setCreditFinancialPin(cnpj, hbApiCooperadoId, pinSetup);
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
    if (!cnpj || !hbApiCooperadoId) return;
    const msg =
      "Solicitar reset do PIN de pagamento?\n\n" +
      "O responsável da cooperativa receberá o pedido em Conta Coop → Limites e precisará confirmar o reset. " +
      "Depois você cadastra um PIN novo aqui.";
    if (!window.confirm(msg)) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = await requestCooperadoPinReset(cnpj, hbApiCooperadoId);
      setPinResetPending(true);
      setSuccess(data.message ?? "Solicitação enviada à cooperativa.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao solicitar reset do PIN.");
    } finally {
      setBusy(false);
    }
  };

  const handleCashbackParaReceber = async () => {
    if (!cnpj || !hbApiCooperadoId || !user || !data || !mesReferenciaReceber || busy || isOffline) return;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return;
    if (cashbackJaNaFicha) {
      setError("Este cashback já está no valor a receber deste mês.");
      return;
    }
    const valorAvulsoId = `var_cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await convertCreditCashbackToReceivable({
        cnpj,
        cooperadoId: hbApiCooperadoId,
        mesReferencia: mesReferenciaReceber,
        valorAvulsoId,
      });
      const amountCents = res.amountCents ?? 0;
      if (amountCents <= 0 && !res.idempotent) throw new Error("Não há cashback disponível.");
      if (amountCents > 0 && !cashbackJaNaFicha) {
        updateData((d) =>
          criarValorAvulsoReceber(d, {
            id: valorAvulsoId,
            cooperativaId: coopId,
            cooperadoId: cooperadoId ?? hbApiCooperadoId,
            mesReferencia: mesReferenciaReceber,
            motivo: CASHBACK_HB_CREDITO_MOTIVO_AVULSO,
            valor: round2(amountCents / 100),
            responsavel: cooperadoNome || user.name,
          })
        );
        const d = getData();
        const cnpjSync = await resolveCooperativaCnpj(d, coopId, user);
        if (cnpjSync) {
          await pushOperacionalToCloud(cnpjSync, d, coopId, { authoritative: true });
        }
      }
      setSuccess(
        `${formatCentsBRL(amountCents)} somado ao valor a receber (${mesReferenciaReceber}). Histórico: ${CASHBACK_HB_CREDITO_MOTIVO_AVULSO}.`
      );
      await reload({ background: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível somar o cashback.");
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

  const saldoHb = account?.valorDisponivelCents ?? 0;
  const cashback = account?.cashbackDisponivelCents ?? 0;
  const podeLiberarCashback =
    cashback > 0 && !cashbackJaNaFicha && Boolean(mesReferenciaReceber) && !isOffline && !busy;
  const pagamentoBloqueado = !hasPin || account?.bloqueado || isOffline;

  const criarCobrancaCooperado = async () => {
    if (!cnpj || !hbApiCooperadoId) return;
    const amount = parseValorHbReais(valorReceberReais);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const idempotencyKey =
        createReceberIdempotencyRef.current ??
        (createReceberIdempotencyRef.current =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? `cr_${crypto.randomUUID()}`
            : `cr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
      const res = await createCooperadoReceberIntent(amount, descricaoReceber.trim() || undefined, {
        idempotencyKey,
        receiverNome: cooperadoNome,
        cnpj,
        cooperadoId: hbApiCooperadoId,
      });
      createReceberIdempotencyRef.current = null;
      if (res.qrPayload && res.intent) {
        storeHbCreditCooperadoReceberDraft({
          v: 1,
          qrPayload: res.qrPayload,
          amountCents: res.intent.amountCents,
          descricao: res.intent.descricao,
          intentId: res.intent.id,
          expiresAt: res.intent.expiresAt,
          receiverNome: cooperadoNome,
        });
        setValorReceberReais("");
        setDescricaoReceber("");
        router.push("/minha-conta-coop/receber");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar cobrança.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-green-700">HB Créditos</p>
        <h1 className="text-2xl font-bold text-gray-900">Conta cooperado</h1>
        <p className="text-sm text-gray-500">
          Pague no mercado parceiro{transferenciaCooperadoAtiva ? " ou receba de outro cooperado" : ""} com QR e PIN
        </p>
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

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-900 via-green-800 to-emerald-700 p-6 text-white shadow-lg ring-1 ring-green-900/10">
        {accountRefreshing && (
          <span className="absolute right-4 top-4 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-green-50">
            Atualizando…
          </span>
        )}
        <p className="text-sm font-medium text-green-100">Saldo HB para pagar</p>
        <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{formatCentsBRL(saldoHb)}</p>

        {cashback > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-green-100">Cashback acumulado</p>
              <p className="text-base font-bold">{formatCentsBRL(cashback)}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="inverse"
              className="shrink-0"
              disabled={!podeLiberarCashback}
              title={
                cashbackJaNaFicha
                  ? "Cashback já somado ao valor a receber"
                  : !mesReferenciaReceber
                    ? "Aguardando mês de recebimento"
                    : "Somar cashback ao valor a receber"
              }
              onClick={() => void handleCashbackParaReceber()}
            >
              {cashbackJaNaFicha ? "Na ficha" : "Liberar na ficha"}
            </Button>
          </div>
        )}

        {updatedAt && (
          <p className="mt-4 text-[11px] text-green-200/75">
            Sincronizado {new Date(updatedAt).toLocaleString("pt-BR")}
          </p>
        )}
      </div>

      <ContaCoopSegmentTabs tabs={segmentTabs} active={tab} onChange={handleTabChange} />

      {tabEverOpened.inicio && (
        <div className={cn("space-y-4", tabPanelHidden("inicio"))}>
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

      {transferenciaCooperadoAtiva && tabEverOpened.receber && (
        <div className={cn("space-y-4", tabPanelHidden("receber"))}>
          <Card className="space-y-4 !p-5">
            <div>
              <h3 className="font-semibold text-gray-900">Receber de outro cooperado</h3>
              <p className="mt-1 text-sm text-gray-600">
                Gere um QR para outro cooperado transferir saldo HB para você.
              </p>
            </div>
            <div>
              <Label htmlFor="coop-receber-valor">Valor (R$)</Label>
              <Input
                id="coop-receber-valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valorReceberReais}
                onChange={(e) => setValorReceberReais(e.target.value)}
                className="mt-1 text-lg"
                disabled={busy || isOffline || account?.bloqueado}
              />
            </div>
            <div>
              <Label htmlFor="coop-receber-descricao">Descrição (opcional)</Label>
              <Input
                id="coop-receber-descricao"
                value={descricaoReceber}
                onChange={(e) => setDescricaoReceber(e.target.value)}
                maxLength={120}
                className="mt-1"
                disabled={busy || isOffline || account?.bloqueado}
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => void criarCobrancaCooperado()}
              disabled={busy || isOffline || account?.bloqueado || !valorReceberReais.trim()}
            >
              Gerar QR para receber
            </Button>
          </Card>
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
                  Escanear QR Code
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
                    Continuar para pagamento
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
          {ledgerLoading && !ledger.length ? (
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
