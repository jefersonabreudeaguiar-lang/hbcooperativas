"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Store } from "lucide-react";
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
  type HbCreditMercadoCobrancaDraft,
} from "@/lib/hb-credit/hbCreditMercadoCobrancaDraft";
import { formatCpfCnpj, formatDateTime } from "@/utils/format";

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
  }, [router]);

  useEffect(() => {
    if (!draft || pago) return;

    let cancelled = false;
    setAguardando(true);

    const verificar = async () => {
      try {
        const status = await pollCreditIntentPayment(draft.intentId);
        if (cancelled) return;

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
          return;
        }

        if (status.status === "expirada" || status.status === "cancelada") {
          clearHbCreditMercadoCobrancaDraft();
          setError(status.status === "expirada" ? "Cobrança expirada." : "Cobrança cancelada.");
          setAguardando(false);
        }
      } catch {
        /* continua polling */
      }
    };

    void verificar();
    const timer = window.setInterval(() => void verificar(), 800);
    return () => {
      cancelled = true;
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
      <div className="flex min-h-[70vh] items-center justify-center bg-zinc-950 text-white/60">
        Carregando…
      </div>
    );
  }

  if (pago) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-zinc-950 text-white">
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-400" strokeWidth={1.5} />
          <p className="mt-6 text-sm font-medium uppercase tracking-wider text-white/50">Pagamento recebido</p>
          <p className="mt-2 text-4xl font-bold tabular-nums">{formatCentsBRL(pago.amountCents)}</p>
          <p className="mt-4 text-lg font-medium">{pago.cooperadoNome}</p>
          {pago.cooperadoCpf && (
            <p className="mt-1 text-sm text-white/55 tabular-nums">{formatCpfCnpj(pago.cooperadoCpf)}</p>
          )}
          <div className="mt-6 space-y-1 text-sm text-white/50">
            {pago.receiptCode && <p>Comprovante {pago.receiptCode}</p>}
            <p>{formatDateTime(pago.paidAt)}</p>
          </div>
        </div>
        <div className="p-6 pb-10">
          <Button
            className="h-14 w-full rounded-2xl bg-emerald-500 text-base font-semibold text-white hover:bg-emerald-600"
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-zinc-950 text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={voltar}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <p className="text-sm font-medium text-white/70">Cobrança HB Créditos</p>
        <span className="w-10" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-4 text-center">
        <div className="mb-6 flex items-center gap-2 text-white/80">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600">
            <Store size={18} />
          </span>
          <p className="text-lg font-semibold">{draft!.parceiroNome}</p>
        </div>

        <p className="text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
          {formatCentsBRL(draft!.amountCents)}
        </p>
        {draft!.descricao ? <p className="mt-2 max-w-xs text-sm text-white/55">{draft!.descricao}</p> : null}

        <div className="relative mt-10 rounded-3xl bg-white p-5 shadow-2xl shadow-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft!.qrUrl}
            alt="QR Code para pagamento HB Créditos"
            className="mx-auto aspect-square w-[min(72vw,18rem)] max-w-full"
          />
        </div>

        <p className="mt-8 max-w-xs text-sm text-white/55">
          Peça ao cooperado escanear este QR no app HB Créditos
        </p>

        {aguardando && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Aguardando pagamento · expira às {expira}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100" role="alert">
            {error}
          </p>
        )}
      </main>

      <footer className="px-6 pb-10 pt-2">
        <Button
          variant="secondary"
          className="h-12 w-full rounded-2xl border border-white/20 bg-transparent text-white hover:bg-white/10"
          disabled={busy}
          onClick={() => void cancelar()}
        >
          Cancelar cobrança
        </Button>
      </footer>
    </div>
  );
}
