"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Store } from "lucide-react";
import { CreditFeatureGate } from "@/components/hb-credit/CreditFeatureGate";
import { Button } from "@/components/ui/Button";
import {
  cancelCreditIntent,
  pollCreditIntentPayment,
} from "@/services/creditApiService";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import {
  clearHbCreditMercadoCobrancaDraft,
  peekHbCreditMercadoCobrancaDraft,
  storeHbCreditMercadoCobrancaDraft,
  type HbCreditMercadoCobrancaDraft,
} from "@/lib/hb-credit/hbCreditMercadoCobrancaDraft";
import { gerarQrDataUrl } from "@/lib/hb-credit/gerarQrDataUrl";
import { formatCpfCnpj, formatDateTime, cn } from "@/utils/format";

const pageBg =
  "min-h-[100dvh] flex flex-col bg-gradient-to-b from-emerald-50 via-green-50/95 to-emerald-100/80 text-gray-900";

type PagamentoOk = {
  amountCents: number;
  descricao?: string;
  cooperadoNome: string;
  cooperadoCpf: string;
  receiptCode: string | null;
  paidAt: string;
};

export default function MercadoCobrarQrPage() {
  return (
    <CreditFeatureGate>
      <MercadoCobrarQrContent />
    </CreditFeatureGate>
  );
}

function MercadoCobrarQrContent() {
  const router = useRouter();
  const [draft, setDraft] = useState<HbCreditMercadoCobrancaDraft | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [qrGerando, setQrGerando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aguardando, setAguardando] = useState(true);
  const [pago, setPago] = useState<PagamentoOk | null>(null);

  useEffect(() => {
    const d = peekHbCreditMercadoCobrancaDraft();
    if (!d) {
      router.replace("/mercado-parceiro");
      return;
    }
    setDraft(d);
    if (d.qrUrl) setQrUrl(d.qrUrl);
  }, [router]);

  useEffect(() => {
    if (!draft?.qrPayload || qrUrl) return;
    let cancelled = false;
    setQrGerando(true);
    void gerarQrDataUrl(draft.qrPayload)
      .then((url) => {
        if (cancelled) return;
        setQrUrl(url);
        storeHbCreditMercadoCobrancaDraft({ ...draft, qrUrl: url });
      })
      .finally(() => {
        if (!cancelled) setQrGerando(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft, qrUrl]);

  useEffect(() => {
    if (!draft || pago) return;

    let cancelled = false;
    setAguardando(true);

    const aplicarPago = (status: Awaited<ReturnType<typeof pollCreditIntentPayment>>, full = false) => {
      if (status.payment || status.status === "confirmada") {
        const pay = status.payment;
        clearHbCreditMercadoCobrancaDraft();
        setPago({
          amountCents: status.amountCents,
          descricao: status.descricao ?? draft.descricao,
          cooperadoNome: pay?.cooperadoNome ?? "Cooperado",
          cooperadoCpf: pay?.cooperadoCpf ?? "",
          receiptCode: pay?.receiptCode ?? null,
          paidAt: pay?.paidAt ?? new Date().toISOString(),
        });
        setAguardando(false);
        if (!full && pay && pay.cooperadoNome === "Cooperado") {
          void pollCreditIntentPayment(draft.intentId, { full: true })
            .then((detalhe) => {
              if (cancelled || !detalhe.payment) return;
              setPago((prev) =>
                prev
                  ? {
                      ...prev,
                      cooperadoNome: detalhe.payment!.cooperadoNome || prev.cooperadoNome,
                      cooperadoCpf: detalhe.payment!.cooperadoCpf || prev.cooperadoCpf,
                      receiptCode: detalhe.payment!.receiptCode ?? prev.receiptCode,
                    }
                  : prev
              );
            })
            .catch(() => {});
        }
        return true;
      }
      return false;
    };

    const verificar = async (full = false) => {
      try {
        const status = await pollCreditIntentPayment(draft.intentId, { lite: !full, full });
        if (cancelled) return;
        if (aplicarPago(status, full)) return;

        if (status.status === "expirada" || status.status === "cancelada") {
          clearHbCreditMercadoCobrancaDraft();
          setError(status.status === "expirada" ? "Cobrança expirada." : "Cobrança cancelada.");
          setAguardando(false);
        }
      } catch {
        /* continua polling */
      }
    };

    void verificar(false);
    const fastTicks = [80, 160, 280, 450, 700];
    const fastTimers = fastTicks.map((ms) =>
      window.setTimeout(() => {
        if (!cancelled) void verificar(false);
      }, ms)
    );
    const timer = window.setInterval(() => void verificar(false), 250);
    return () => {
      cancelled = true;
      fastTimers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(timer);
    };
  }, [draft, pago]);

  const voltar = useCallback(() => {
    router.replace("/mercado-parceiro");
  }, [router]);

  const cancelar = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      await cancelCreditIntent(draft.intentId);
      clearHbCreditMercadoCobrancaDraft();
      router.replace("/mercado-parceiro");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar.");
      setBusy(false);
    }
  };

  if (!draft && !pago) {
    return (
      <div className={cn(pageBg, "items-center justify-center gap-4 px-6")}>
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-center text-sm font-medium text-emerald-900">Preparando cobrança…</p>
      </div>
    );
  }

  if (pago) {
    return (
      <div className={pageBg}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600" strokeWidth={1.5} />
          <p className="mt-6 text-sm font-medium uppercase tracking-wider text-emerald-800">Pagamento recebido</p>
          <p className="mt-2 text-4xl font-bold tabular-nums text-gray-900">{formatCentsBRL(pago.amountCents)}</p>
          <p className="mt-4 text-lg font-medium text-gray-900">{pago.cooperadoNome}</p>
          {pago.cooperadoCpf && (
            <p className="mt-1 text-sm text-gray-600 tabular-nums">{formatCpfCnpj(pago.cooperadoCpf)}</p>
          )}
          <div className="mt-6 space-y-1 text-sm text-gray-600">
            {pago.receiptCode && <p>Comprovante {pago.receiptCode}</p>}
            <p>{formatDateTime(pago.paidAt)}</p>
          </div>
        </div>
        <div className="p-6 pb-10">
          <Button
            className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
            onClick={() => router.replace("/mercado-parceiro")}
          >
            Nova cobrança
          </Button>
        </div>
      </div>
    );
  }

  const expira = new Date(draft!.expiresAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">HB Créditos · Mercado</p>
          <h1 className="text-lg font-semibold text-gray-900">Aguardando pagamento</h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pb-4 pt-2 text-center">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 shadow-sm">
            <Store size={24} className="text-white" />
          </span>
          <p className="text-lg font-semibold text-gray-900">{draft!.parceiroNome}</p>
        </div>

        <p className="mt-6 text-5xl font-bold tracking-tight tabular-nums text-gray-900 sm:text-6xl">
          {formatCentsBRL(draft!.amountCents)}
        </p>
        {draft!.descricao ? <p className="mt-2 max-w-xs text-sm text-gray-600">{draft!.descricao}</p> : null}

        <div className="relative mt-10 rounded-3xl bg-white p-5 shadow-lg ring-1 ring-emerald-900/10">
          {qrUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrUrl}
              alt="QR Code para pagamento HB Créditos"
              className="mx-auto aspect-square w-[min(72vw,18rem)] max-w-full"
            />
          ) : (
            <div
              className="mx-auto flex aspect-square w-[min(72vw,18rem)] max-w-full items-center justify-center rounded-2xl bg-emerald-50/80"
              aria-busy={qrGerando}
            >
              <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
            </div>
          )}
        </div>

        <p className="mt-8 max-w-xs text-sm text-gray-600">
          Peça ao cooperado escanear este QR no app HB Créditos
        </p>

        {aguardando && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600/10 px-4 py-2 text-xs font-medium text-emerald-900">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
            Aguardando pagamento · expira às {expira}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
      </main>

      <footer className="border-t border-emerald-900/10 bg-white/50 px-6 pb-10 pt-5 backdrop-blur-sm">
        <Button
          variant="secondary"
          className="h-12 w-full rounded-2xl border-emerald-900/15 bg-white/80 text-gray-800 hover:bg-white"
          disabled={busy}
          onClick={() => void cancelar()}
        >
          {busy ? "Cancelando…" : "Cancelar cobrança"}
        </Button>
      </footer>
    </div>
  );
}
