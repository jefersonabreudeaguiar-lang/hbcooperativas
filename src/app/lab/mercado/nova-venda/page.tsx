"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { LabShell, LabPrimaryButton } from "@/modules/hb-credit-lab/components/LabShell";
import { LAB_DEMO_MARKET_SESSION } from "@/modules/hb-credit-lab/mock/labSeed";
import { formatCentsBRL } from "@/modules/hb-credit-lab/engine/money";
import type { LabPaymentIntent } from "@/modules/hb-credit-lab/types";

export default function MercadoNovaVendaPage() {
  const [amount, setAmount] = useState("32.90");
  const [desc, setDesc] = useState("");
  const [intent, setIntent] = useState<LabPaymentIntent | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [error, setError] = useState("");
  const [markets, setMarkets] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    fetch("/api/lab/credit/payment-intents")
      .then((r) => r.json())
      .then((json) => setMarkets(json.markets ?? []));
  }, []);

  const generate = async () => {
    setError("");
    const marketId = sessionStorage.getItem(LAB_DEMO_MARKET_SESSION) ?? markets[0]?.id;
    if (!marketId) {
      setError("Mercado lab não configurado.");
      return;
    }
    const res = await fetch("/api/lab/credit/payment-intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketId, amountReais: Number(amount), descricao: desc }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Erro ao gerar cobrança.");
      return;
    }
    setIntent(json.intent);
    setQrPayload(json.qrPayload);
    const dataUrl = await QRCode.toDataURL(json.qrPayload, { margin: 2, width: 240 });
    setQrDataUrl(dataUrl);
  };

  return (
    <LabShell title="Nova venda" subtitle="Gera cobrança + QR experimental." backHref="/lab/mercado/painel">
      <div className="space-y-3">
        <label className="block text-sm text-slate-400">
          Valor (R$)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
          />
        </label>
        <label className="block text-sm text-slate-400">
          Descrição (opcional)
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white"
          />
        </label>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <LabPrimaryButton onClick={() => void generate()}>Gerar cobrança e QR</LabPrimaryButton>
      </div>

      {intent && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-center space-y-3">
          <p className="text-sm font-medium">{formatCentsBRL(intent.amountCents)}</p>
          {qrDataUrl && <img src={qrDataUrl} alt="QR experimental" className="mx-auto rounded-lg" />}
          <textarea
            readOnly
            value={qrPayload}
            rows={3}
            className="w-full text-[10px] rounded-lg border border-white/10 bg-black/30 p-2 text-slate-300"
          />
          <p className="text-xs text-slate-400">Aguardando pagamento na Conta Coop (lab)…</p>
        </div>
      )}
    </LabShell>
  );
}
