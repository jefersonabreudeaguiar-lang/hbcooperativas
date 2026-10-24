"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Store, Users } from "lucide-react";
import { HbCreditPaymentComprovante } from "@/components/hb-credit/HbCreditPaymentComprovante";
import { isCooperadoTransferIntentId } from "@/config/cooperadoTransferenciaCredito";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { HbCreditPinDotsInput } from "@/components/hb-credit/HbCreditPinDotsInput";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  authorizeCreditPayment,
  fetchCreditAccount,
  validateCreditQr,
} from "@/services/creditApiService";
import { resolveCooperadoHbCreditCnpjDigits } from "@/lib/hb-credit/resolveCooperadoHbCreditCnpj";
import { kickHbCreditQrValidation } from "@/lib/hb-credit/openHbCreditPaymentFromQr";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { bicCentralMesPrincipalQuantoVouReceber } from "@/services/bicLeituraCentralCooperado";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import { notifyHbCreditAccountCacheUpdated } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import {
  clearHbCreditPaymentDraft,
  clearHbCreditPendingQrScan,
  peekHbCreditPaymentDraft,
  peekHbCreditPendingQrScan,
  type HbCreditPaymentDraft,
} from "@/lib/hb-credit/hbCreditPaymentDraft";
import {
  clearHbCreditPaymentReceipt,
  storeHbCreditPaymentReceipt,
  type HbCreditPaymentReceipt,
} from "@/lib/hb-credit/hbCreditPaymentReceipt";
import {
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
  lerHbCreditAccountPersistido,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import {
  canAffordHbPaymentScanPreview,
  canAffordHbPaymentWithLimite,
  hbCreditDebitFromGrossCents,
  mergeHbPaymentLimiteForScan,
} from "@/modules/hb-credit/engine/paymentAffordability";
import { cn } from "@/utils/format";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import {
  hbCooperadoFlowPage,
  hbCooperadoIconTile,
  hbCooperadoPrimaryBtn,
  hbCooperadoSurfaceCard,
  hbCooperadoValueBox,
} from "@/lib/hb-credit/hbCreditCooperadoUi";

export default function HbCreditPagarPage() {
  return (
    <CreditFeatureGate>
      <CloudSessionGate optimistic>
        <HbCreditPagarContent />
      </CloudSessionGate>
    </CreditFeatureGate>
  );
}

function HbCreditPagarContent() {
  const router = useRouter();
  const { user, cooperadoId } = usePermissions();
  const data = useAppData();
  const [draft, setDraft] = useState<HbCreditPaymentDraft | null>(null);
  const [loadingQr, setLoadingQr] = useState(() =>
    typeof window === "undefined" ? true : !peekHbCreditPaymentDraft()
  );
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [payPin, setPayPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<HbCreditPaymentReceipt | null>(null);
  const [contaLimite, setContaLimite] = useState<ContaCoopLimiteCooperado | null>(null);
  const [limiteContaRefreshing, setLimiteContaRefreshing] = useState(false);
  const autoPayPinRef = useRef("");
  const payInFlightRef = useRef(false);
  const qrRevalidateRef = useRef(false);

  const hbApiCooperadoId = useMemo(
    () => resolveHbCreditApiCooperadoId(user, cooperadoId),
    [user, cooperadoId]
  );

  const cnpj = useMemo(() => resolveCooperadoHbCreditCnpjDigits(user, data), [user, data]);

  const cooperadoNome = useMemo(() => {
    if (!data || !cooperadoId) return user?.name ?? "";
    return data.cooperados.find((c) => c.id === cooperadoId)?.nomeCompleto ?? user?.name ?? "";
  }, [data, cooperadoId, user?.name]);

  const contaCoopValorSync = useMemo(() => {
    if (!data || !cooperadoId || !user || !cnpj) return undefined;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId || !isContaCoopValorReceberPilot(cooperadoId, cooperadoNome)) return undefined;
    return {
      cooperativaId: coopId,
      mesReferencia: bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, coopId),
    };
  }, [cnpj, cooperadoId, cooperadoNome, data, user]);

  useEffect(() => {
    if (!cnpj || !hbApiCooperadoId) return;

    const ready = peekHbCreditPaymentDraft();
    if (ready) {
      setDraft(ready);
      setLoadingQr(false);
      return;
    }

    const pending = peekHbCreditPendingQrScan();
    if (!pending) {
      router.replace("/minha-conta-coop");
      return;
    }
    if (
      pending.cnpj !== cnpj ||
      (pending.cooperadoId !== hbApiCooperadoId &&
        pending.cooperadoId !== cooperadoId &&
        pending.cooperadoId !== user?.cooperadoId)
    ) {
      clearHbCreditPendingQrScan();
      router.replace("/minha-conta-coop");
      return;
    }

    let cancelled = false;
    setLoadingQr(true);
    setError("");
    void kickHbCreditQrValidation({
      cnpj: pending.cnpj,
      cooperadoId: pending.cooperadoId,
      qrPayload: pending.qrPayload,
    })
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          throw new Error("Cobrança inválida ou expirada.");
        }
        setDraft(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Não foi possível validar o QR Code.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingQr(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cnpj, hbApiCooperadoId, cooperadoId, user?.cooperadoId, router]);

  useEffect(() => {
    if (!loadingQr || draft) return;
    const tick = () => {
      const ready = peekHbCreditPaymentDraft();
      if (ready) {
        setDraft(ready);
        setLoadingQr(false);
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [draft, loadingQr]);

  useEffect(() => {
    if (!cnpj || !hbApiCooperadoId) return;
    const cached = lerHbCreditAccountPersistido(cnpj, hbApiCooperadoId);
    if (cached?.account) setContaLimite(cached.account);
    if (cached?.hasPin) setHasPin(true);
    setLimiteContaRefreshing(true);
    void fetchCreditAccount(cnpj, hbApiCooperadoId)
      .then((acc) => {
        setHasPin(Boolean(acc.hasPin));
        if (acc.account) setContaLimite(acc.account as ContaCoopLimiteCooperado);
      })
      .catch(() => {
        /* Rede lenta: não assumir “sem PIN” — authorize valida o PIN na nuvem. */
      })
      .finally(() => setLimiteContaRefreshing(false));
  }, [cnpj, hbApiCooperadoId]);

  const intent = draft?.intent;

  const limite = useMemo(() => {
    if (!draft?.limite) return undefined;
    return mergeHbPaymentLimiteForScan(draft.limite, contaLimite);
  }, [draft?.limite, contaLimite]);

  useEffect(() => {
    if (!draft || !cnpj || !hbApiCooperadoId || qrRevalidateRef.current) return;
    if (!limite || !intent) return;
    if (canAffordHbPaymentScanPreview(limite, intent.amountCents)) return;
    qrRevalidateRef.current = true;
    setLimiteContaRefreshing(true);
    void validateCreditQr(cnpj, hbApiCooperadoId, draft.qrPayload, { fast: false })
      .then((res) => {
        if (!res.intent || !res.limite || !res.parceiroNome) return;
        const next: HbCreditPaymentDraft = {
          v: 1,
          qrPayload: draft.qrPayload,
          intent: res.intent,
          parceiroNome: res.parceiroNome,
          limite: res.limite,
          savedAt: new Date().toISOString(),
        };
        setDraft(next);
      })
      .catch(() => {
        /* Mantém draft + conta local; authorize é autoridade final. */
      })
      .finally(() => setLimiteContaRefreshing(false));
  }, [cnpj, draft, hbApiCooperadoId, intent, limite]);

  const pagamentoCooperado = intent ? isCooperadoTransferIntentId(intent.id) : false;
  const saldoDisponivel = limite?.valorDisponivelCents ?? 0;
  const cashbackAvail = limite?.cashbackDisponivelCents ?? 0;
  const useCashbackOnPay = useMemo(() => {
    if (!limite || !intent || pagamentoCooperado) return false;
    if (canAffordHbPaymentWithLimite(limite, intent.amountCents, false)) return false;
    return canAffordHbPaymentWithLimite(limite, intent.amountCents, true);
  }, [limite, intent, pagamentoCooperado]);
  const debito = intent
    ? hbCreditDebitFromGrossCents(intent.amountCents, useCashbackOnPay, cashbackAvail)
    : 0;
  const saldoApos = Math.max(0, saldoDisponivel - debito);

  const voltar = useCallback(() => {
    clearHbCreditPaymentDraft();
    clearHbCreditPendingQrScan();
    router.back();
  }, [router]);

  const confirmar = useCallback(async () => {
    if (!draft || !cnpj || !hbApiCooperadoId || !intent || !limite) return;
    if (hasPin === false) {
      setError("Cadastre seu PIN de pagamento em HB Créditos → Início antes de continuar.");
      return;
    }
    if (busy || payInFlightRef.current) return;
    if (!canAffordHbPaymentScanPreview(limite, intent.amountCents)) {
      setError("Saldo insuficiente ou saldo ainda atualizando. Aguarde alguns segundos e tente de novo.");
      return;
    }
    payInFlightRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await authorizeCreditPayment({
        cnpj,
        cooperadoId: hbApiCooperadoId,
        cooperadoNome,
        cooperativaId: contaCoopValorSync?.cooperativaId,
        mesReferencia: contaCoopValorSync?.mesReferencia,
        amountReais: debito / 100,
        parceiroNome: draft.parceiroNome,
        intentId: intent.id,
        nonce: intent.nonce,
        pin: payPin,
        idempotencyKey: `pay:${intent.id}:${hbApiCooperadoId}`,
        useCashback: pagamentoCooperado ? false : useCashbackOnPay,
      });

      if (typeof res.disponivelAposCents === "number") {
        const nextDisponivel = Math.max(0, res.disponivelAposCents);
        const nextAccount: ContaCoopLimiteCooperado = {
          ...limite,
          valorDisponivelCents: nextDisponivel,
          valorUsadoCents: Math.min(limite.limiteLiberadoCents, limite.valorUsadoCents + debito),
          cashbackDisponivelCents: useCashbackOnPay
            ? Math.max(0, cashbackAvail - Math.min(cashbackAvail, intent.amountCents))
            : limite.cashbackDisponivelCents,
        };
        gravarHbCreditAccountPersistido(cnpj, hbApiCooperadoId, {
          v: HB_CREDIT_ACCOUNT_STORAGE_VERSION,
          account: nextAccount,
          updatedAt: new Date().toISOString(),
          hasPin: true,
          pinResetPending: false,
          savedAt: new Date().toISOString(),
        });
        notifyHbCreditAccountCacheUpdated();
      }

      const paidAt = new Date().toISOString();
      const receipt: HbCreditPaymentReceipt = {
        v: 1,
        receiptCode: res.receiptCode ?? "—",
        transacaoId: res.transacaoId ?? intent.id,
        amountCents: intent.amountCents,
        debitoCents: debito,
        parceiroNome: draft.parceiroNome,
        cooperadoNome,
        cnpj,
        cooperadoId: hbApiCooperadoId,
        paidAt,
        saldoAposCents: res.disponivelAposCents,
        pagamentoCooperado,
      };
      storeHbCreditPaymentReceipt(receipt);
      clearHbCreditPaymentDraft();
      setPayPin("");
      autoPayPinRef.current = "";
      setSuccess(receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir o pagamento.");
    } finally {
      payInFlightRef.current = false;
      setBusy(false);
    }
  }, [
    busy,
    cnpj,
    contaCoopValorSync?.cooperativaId,
    contaCoopValorSync?.mesReferencia,
    cooperadoNome,
    debito,
    draft,
    hbApiCooperadoId,
    hasPin,
    intent,
    limite,
    pagamentoCooperado,
    payPin,
    useCashbackOnPay,
    cashbackAvail,
  ]);

  const affordOk = limite && intent ? canAffordHbPaymentScanPreview(limite, intent.amountCents) : false;

  useEffect(() => {
    if (
      !draft ||
      !intent ||
      !limite ||
      busy ||
      success ||
      hasPin === false ||
      !affordOk ||
      payPin.length < FINANCIAL_PIN_MIN_LENGTH
    ) {
      if (payPin.length < FINANCIAL_PIN_MIN_LENGTH) autoPayPinRef.current = "";
      return;
    }
    if (autoPayPinRef.current === payPin) return;
    autoPayPinRef.current = payPin;
    void confirmar();
  }, [affordOk, busy, confirmar, draft, hasPin, intent, limite, payPin, success]);

  const aguardandoCobranca = loadingQr && !draft && !error;

  if (!draft && !error && !aguardandoCobranca) {
    return null;
  }

  if (!draft && !aguardandoCobranca) {
    return (
      <div className={cn(hbCooperadoFlowPage, "items-center justify-center px-6")}>
        <p className="text-center text-sm text-red-800" role="alert">
          {error || "Não foi possível abrir esta cobrança."}
        </p>
        <Button className="mt-6" variant="secondary" onClick={() => router.replace("/minha-conta-coop")}>
          Voltar
        </Button>
      </div>
    );
  }

  if (aguardandoCobranca) {
    return (
      <div className={hbCooperadoFlowPage}>
        <header className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={voltar}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-100"
            aria-label="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">HB Créditos</p>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">Confirmar</h1>
          </div>
        </header>
        <main className="flex-1 px-5 pb-4 pt-2">
          <p className="text-sm text-gray-600">Validando cobrança do mercado…</p>
          <div className={cn("mt-6 flex items-center gap-3", hbCooperadoValueBox)}>
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-900">Quase lá</p>
              <p className="text-xs text-gray-600">Em instantes você digita o PIN</p>
            </div>
          </div>
          <div className="mt-8 opacity-60 pointer-events-none">
            <HbCreditPinDotsInput
              variant="light"
              value=""
              onChange={() => {}}
              disabled
              label="Digite seu PIN"
              hint="Aguardando valor da cobrança…"
            />
          </div>
        </main>
      </div>
    );
  }

  if (!draft || !intent) {
    return (
      <div className={cn(hbCooperadoFlowPage, "items-center justify-center px-6")}>
        <p className="text-center text-sm text-red-800" role="alert">
          {error || "Não foi possível abrir esta cobrança."}
        </p>
        <Button className="mt-6" variant="secondary" onClick={() => router.replace("/minha-conta-coop")}>
          Voltar
        </Button>
      </div>
    );
  }

  if (success) {
    return (
      <div className={hbCooperadoFlowPage}>
        <HbCreditPaymentComprovante
          receipt={success}
          onConcluir={() => {
            clearHbCreditPaymentReceipt();
            router.replace("/minha-conta-coop");
          }}
        />
      </div>
    );
  }

  const podePagar =
    !busy &&
    payPin.length >= FINANCIAL_PIN_MIN_LENGTH &&
    (affordOk || limiteContaRefreshing) &&
    hasPin !== false;

  return (
    <div className={hbCooperadoFlowPage}>
      {busy && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-950/40 px-8 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-600" />
            <p className="mt-4 text-lg font-semibold text-gray-900">Confirmando pagamento</p>
            <p className="mt-2 text-sm text-gray-600">
              Não feche o app. Em alguns segundos você verá o comprovante.
            </p>
          </div>
        </div>
      )}
      <header className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={voltar}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-100"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">HB Créditos</p>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">Confirmar</h1>
        </div>
      </header>

      <main className="flex-1 px-5 pb-4 pt-2">
        <p className="text-sm text-gray-500">Pagando para</p>
        <div className="mt-2 flex items-start gap-3">
          <span className={hbCooperadoIconTile}>
            {pagamentoCooperado ? (
              <Users size={24} className="text-white" />
            ) : (
              <Store size={24} className="text-white" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-snug text-gray-900">{draft.parceiroNome}</p>
            {intent.descricao ? (
              <p className="mt-0.5 text-sm text-gray-600 line-clamp-2">{intent.descricao}</p>
            ) : null}
          </div>
        </div>

        <p className="mt-5 text-[2.75rem] font-bold leading-none tracking-tight tabular-nums text-gray-900">
          {formatCentsBRL(intent.amountCents)}
        </p>

        <div className="mt-8">
          <HbCreditPinDotsInput
            variant="light"
            value={payPin}
            onChange={setPayPin}
            disabled={busy || hasPin === false}
            autoFocus
            label="Digite seu PIN"
            hint={busy ? "Confirmando na nuvem…" : "Confirma automaticamente ao completar"}
          />
        </div>

        <div className={cn("mt-6 space-y-0 divide-y divide-emerald-100/80 px-4", hbCooperadoSurfaceCard)}>
          <Row label="Forma de pagamento" value="HB Crédito" />
          <Row label="Seu saldo agora" value={formatCentsBRL(saldoDisponivel)} />
          <Row label="Saldo após pagamento" value={formatCentsBRL(saldoApos)} highlight />
        </div>

        {limiteContaRefreshing && (
          <p className="mt-4 text-sm text-gray-600" role="status">
            Atualizando seu saldo HB… você já pode digitar o PIN.
          </p>
        )}

        {!affordOk && !limiteContaRefreshing && (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 border border-amber-200" role="alert">
            Saldo insuficiente para este valor. Aguarde a cooperativa liberar crédito ou pague um valor menor no
            mercado.
          </p>
        )}

        {hasPin === false && (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 border border-amber-200">
            Antes de pagar, cadastre seu PIN na tela HB Créditos → Início.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 border border-red-200" role="alert">
            {error}
          </p>
        )}
      </main>

      <footer className="border-t border-emerald-100 bg-white/90 px-5 pb-10 pt-5 backdrop-blur-md">
        <Button
          className={cn(hbCooperadoPrimaryBtn, "disabled:opacity-40")}
          disabled={!podePagar}
          onClick={() => void confirmar()}
        >
          {busy
            ? "Confirmando…"
            : limiteContaRefreshing
              ? "Atualizando saldo…"
              : affordOk
                ? `Pagar ${formatCentsBRL(intent.amountCents)}`
                : "Saldo insuficiente"}
        </Button>
      </footer>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", highlight ? "text-emerald-800" : "text-emerald-950")}>
        {value}
      </span>
    </div>
  );
}
