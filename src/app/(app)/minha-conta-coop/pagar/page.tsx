"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Store } from "lucide-react";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { CloudSessionGate } from "@/components/hb-credit/CloudSessionGate";
import { HbCreditPinDotsInput } from "@/components/hb-credit/HbCreditPinDotsInput";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppData } from "@/hooks/useAppData";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import {
  authorizeCreditPayment,
  fetchCreditAccount,
} from "@/services/creditApiService";
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
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
  lerHbCreditAccountPersistido,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { canAffordHbPaymentWithLimite } from "@/modules/hb-credit/engine/paymentAffordability";
import { cn } from "@/utils/format";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";

const pageBg = "min-h-[calc(100vh-4rem)] flex flex-col bg-gradient-to-b from-emerald-50 via-green-50/95 to-emerald-100/80 text-gray-900";

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
  const [success, setSuccess] = useState<{ receiptCode: string } | null>(null);

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
    if (!cnpj || !hbApiCooperadoId) return;
    const cached = lerHbCreditAccountPersistido(cnpj, hbApiCooperadoId);
    if (cached?.hasPin) setHasPin(true);
  }, [cnpj, hbApiCooperadoId]);

  useEffect(() => {
    if (!cnpj || !hbApiCooperadoId || loadingQr) return;
    void fetchCreditAccount(cnpj, hbApiCooperadoId)
      .then((acc) => setHasPin(Boolean(acc.hasPin)))
      .catch(() => {
        /* Rede lenta: não assumir “sem PIN” — authorize valida o PIN na nuvem. */
      });
  }, [cnpj, hbApiCooperadoId, loadingQr]);

  const limite = draft?.limite;
  const intent = draft?.intent;
  const saldoDisponivel = limite?.valorDisponivelCents ?? 0;
  const debito = intent?.amountCents ?? 0;
  const saldoApos = Math.max(0, saldoDisponivel - debito);

  const voltar = useCallback(() => {
    clearHbCreditPaymentDraft();
    clearHbCreditPendingQrScan();
    router.back();
  }, [router]);

  const confirmar = async () => {
    if (!draft || !cnpj || !hbApiCooperadoId || !intent || !limite) return;
    if (hasPin === false) {
      setError("Cadastre seu PIN de pagamento em HB Créditos → Início antes de continuar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await authorizeCreditPayment({
        cnpj,
        cooperadoId: hbApiCooperadoId,
        cooperadoNome,
        cooperativaId: contaCoopValorSync?.cooperativaId,
        mesReferencia: contaCoopValorSync?.mesReferencia,
        intentId: intent.id,
        nonce: intent.nonce,
        pin: payPin,
        idempotencyKey: `pay:${intent.id}:${hbApiCooperadoId}`,
      });

      if (typeof res.disponivelAposCents === "number") {
        const nextDisponivel = Math.max(0, res.disponivelAposCents);
        const nextAccount: ContaCoopLimiteCooperado = {
          ...limite,
          valorDisponivelCents: nextDisponivel,
          valorUsadoCents: Math.min(limite.limiteLiberadoCents, limite.valorUsadoCents + debito),
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

      clearHbCreditPaymentDraft();
      setSuccess({ receiptCode: res.receiptCode ?? "—" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir o pagamento.");
    } finally {
      setBusy(false);
    }
  };

  if (loadingQr || (!draft && !error)) {
    return (
      <div className={cn(pageBg, "items-center justify-center gap-4 px-6")}>
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-center text-sm font-medium text-emerald-900">Preparando pagamento…</p>
      </div>
    );
  }

  if (!draft || !intent) {
    return (
      <div className={cn(pageBg, "items-center justify-center px-6")}>
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
      <div className={pageBg}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600" strokeWidth={1.5} />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-emerald-950">Pagamento enviado</h1>
          <p className="mt-2 text-4xl font-bold tabular-nums text-gray-900">
            {formatCentsBRL(intent.amountCents)}
          </p>
          <p className="mt-1 text-sm text-gray-600">{draft.parceiroNome}</p>
          <p className="mt-6 rounded-full bg-emerald-600/15 px-4 py-2 text-sm font-medium text-emerald-900">
            Comprovante {success.receiptCode}
          </p>
        </div>
        <div className="p-6 pb-10">
          <Button
            className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
            onClick={() => router.replace("/minha-conta-coop")}
          >
            Concluir
          </Button>
        </div>
      </div>
    );
  }

  const affordOk = limite ? canAffordHbPaymentWithLimite(limite, intent.amountCents, false) : false;
  const podePagar =
    !busy &&
    payPin.length >= FINANCIAL_PIN_MIN_LENGTH &&
    affordOk &&
    hasPin !== false;

  return (
    <div className={pageBg}>
      <header className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={voltar}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-emerald-900 shadow-sm"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">HB Créditos</p>
          <h1 className="text-lg font-semibold text-gray-900">Confirmar pagamento</h1>
        </div>
      </header>

      <main className="flex-1 px-5 pb-4 pt-2">
        <p className="text-sm text-gray-600">Você está pagando</p>
        <div className="mt-2 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 shadow-sm">
            <Store size={24} className="text-white" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-snug text-gray-900">{draft.parceiroNome}</p>
            {intent.descricao ? (
              <p className="mt-0.5 text-sm text-gray-600 line-clamp-2">{intent.descricao}</p>
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-5xl font-bold tracking-tight tabular-nums text-gray-900">
          {formatCentsBRL(intent.amountCents)}
        </p>

        <div className="mt-8">
          <HbCreditPinDotsInput
            variant="light"
            value={payPin}
            onChange={setPayPin}
            disabled={busy || hasPin === false}
            autoFocus
            label="PIN de pagamento"
            hint="Toque nas bolinhas e digite seu PIN no teclado"
          />
        </div>

        <div className="mt-6 space-y-0 divide-y divide-emerald-900/10 rounded-2xl border border-emerald-900/10 bg-white/70 px-4 shadow-sm backdrop-blur-sm">
          <Row label="Forma de pagamento" value="HB Crédito" />
          <Row label="Seu saldo agora" value={formatCentsBRL(saldoDisponivel)} />
          <Row label="Saldo após pagamento" value={formatCentsBRL(saldoApos)} highlight />
        </div>

        {!affordOk && (
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

      <footer className="border-t border-emerald-900/10 bg-white/50 px-5 pb-10 pt-5 backdrop-blur-sm">
        <Button
          className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          disabled={!podePagar}
          onClick={() => void confirmar()}
        >
          {busy ? "Processando…" : affordOk ? `Pagar ${formatCentsBRL(intent.amountCents)}` : "Saldo insuficiente"}
        </Button>
      </footer>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", highlight ? "text-emerald-800" : "text-gray-900")}>
        {value}
      </span>
    </div>
  );
}
