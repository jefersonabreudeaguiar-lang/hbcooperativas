"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import type { HbCreditPaymentReceipt } from "@/lib/hb-credit/hbCreditPaymentReceipt";
import {
  ensureHbCreditReceiptShareRuntime,
  isHbCreditReceiptShareStaleError,
  shareHbCreditPaymentReceipt,
} from "@/lib/hb-credit/hbCreditReceiptShareImage";
import { hbCooperadoPrimaryBtn } from "@/lib/hb-credit/hbCreditCooperadoUi";
import { cn } from "@/utils/format";

type Props = {
  receipt: HbCreditPaymentReceipt;
  onConcluir: () => void;
  className?: string;
};

export function HbCreditPaymentComprovante({ receipt, onConcluir, className }: Props) {
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    void ensureHbCreditReceiptShareRuntime();
  }, []);

  const paidLabel = useMemo(
    () => new Date(receipt.paidAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    [receipt.paidAt]
  );

  const share = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const mode = await shareHbCreditPaymentReceipt(receipt);
      if (mode === "downloaded") {
        alert("Imagem do comprovante salva. Envie pelo WhatsApp ou galeria.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "";
      if (isHbCreditReceiptShareStaleError(msg)) {
        alert("O app estava desatualizado. Feche e abra de novo; na próxima vez a imagem deve sair normalmente.");
        return;
      }
      alert(e instanceof Error ? e.message : "Não foi possível compartilhar a imagem.");
    } finally {
      setSharing(false);
    }
  }, [receipt, sharing]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-1 flex-col px-5 pb-6 pt-4">
        <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-emerald-200/90 bg-white shadow-lg shadow-emerald-900/10">
          <div className="bg-gradient-to-br from-emerald-700 via-green-700 to-emerald-800 px-6 py-5 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/90">
              HB Créditos
            </p>
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-200" strokeWidth={2} />
              <h1 className="text-xl font-semibold tracking-tight">Pagamento realizado</h1>
            </div>
            <p className="mt-4 text-4xl font-bold tabular-nums tracking-tight">
              {formatCentsBRL(receipt.amountCents)}
            </p>
          </div>

          <div className="divide-y divide-gray-100 px-5 py-1 text-sm">
            <Row label="Beneficiário" value={receipt.parceiroNome} />
            <Row label="Pagador" value={receipt.cooperadoNome} />
            <Row label="Forma" value="HB Crédito" />
            <Row label="Data e hora" value={paidLabel} />
            <Row label="Comprovante" value={receipt.receiptCode} mono />
            <Row label="Transação" value={receipt.transacaoId} mono subtle />
            {typeof receipt.saldoAposCents === "number" ? (
              <Row label="Saldo HB após" value={formatCentsBRL(receipt.saldoAposCents)} highlight />
            ) : null}
          </div>

          <p className="border-t border-gray-100 px-5 py-3 text-center text-xs text-gray-500">
            O mercado foi notificado na hora. Guarde este comprovante.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="mx-auto mt-5 flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border-emerald-200 py-3"
          disabled={sharing}
          onClick={() => void share()}
        >
          {sharing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
          {sharing ? "Gerando imagem…" : "Compartilhar comprovante"}
        </Button>
      </div>

      <div className="border-t border-emerald-100 bg-white/90 px-5 pb-10 pt-5 backdrop-blur-md">
        <Button className={hbCooperadoPrimaryBtn} onClick={onConcluir}>
          Concluir
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  subtle,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  subtle?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-gray-500">{label}</span>
      <span
        className={cn(
          "font-medium text-gray-900 break-all sm:text-right",
          mono && "font-mono text-xs sm:text-sm",
          subtle && "text-gray-600",
          highlight && "font-semibold text-emerald-800"
        )}
      >
        {value}
      </span>
    </div>
  );
}
