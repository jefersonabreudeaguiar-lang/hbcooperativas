"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LabShell, LabPrimaryButton } from "@/modules/hb-credit-lab/components/LabShell";
import { formatCentsBRL } from "@/modules/hb-credit-lab/engine/money";
import type { LabCreditAccount, LabPaymentIntent } from "@/modules/hb-credit-lab/types";

function ConfirmarContent() {
  const router = useRouter();
  const params = useSearchParams();
  const intentId = params.get("intentId") ?? "";
  const [intent, setIntent] = useState<LabPaymentIntent | null>(null);
  const [account, setAccount] = useState<LabCreditAccount | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("hb_lab_intent");
    if (cached) {
      try {
        setIntent(JSON.parse(cached) as LabPaymentIntent);
      } catch {
        /* ignore */
      }
    }
    if (intentId) {
      fetch(`/api/lab/credit/payment-intents?id=${encodeURIComponent(intentId)}`)
        .then((r) => r.json())
        .then((json) => setIntent(json.intent ?? null));
    }
    fetch("/api/lab/credit/account")
      .then((r) => r.json())
      .then((json) => setAccount(json.account ?? null));
  }, [intentId]);

  const confirm = async () => {
    if (!intent) return;
    setLoading(true);
    setError("");
    try {
      const idempotencyKey = `lab_pay_${intent.id}_${Date.now()}`;
      const res = await fetch("/api/lab/credit/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: intent.id,
          nonce: intent.nonce,
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Pagamento recusado");
      sessionStorage.setItem("hb_lab_receipt", JSON.stringify(json.transaction));
      router.push(`/lab/conta-coop/pagar/comprovante?tx=${json.transaction.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no pagamento experimental.");
    } finally {
      setLoading(false);
    }
  };

  if (!intent) {
    return (
      <LabShell title="Confirmar" backHref="/lab/conta-coop/pagar">
        <p className="text-sm text-slate-400">Carregando cobrança…</p>
      </LabShell>
    );
  }

  const saldoAntes = account?.saldoDisponivelCents ?? 0;
  const saldoDepois = saldoAntes - intent.amountCents;

  return (
    <LabShell title="Confirmar pagamento" subtitle="Revise antes de autorizar." backHref="/lab/conta-coop/pagar">
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <Row label="Mercado" value={intent.marketNome} />
        <Row label="Valor" value={formatCentsBRL(intent.amountCents)} />
        {intent.descricao && <Row label="Descrição" value={intent.descricao} />}
        <Row label="Saldo antes" value={formatCentsBRL(saldoAntes)} />
        <Row label="Saldo depois" value={formatCentsBRL(Math.max(0, saldoDepois))} />
      </div>
      {error && <p className="text-sm text-rose-300 mt-3">{error}</p>}
      <div className="mt-6 space-y-2">
        <LabPrimaryButton onClick={() => void confirm()} disabled={loading || saldoDepois < 0}>
          {loading ? "Processando…" : "Confirmar pagamento experimental"}
        </LabPrimaryButton>
      </div>
    </LabShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

export default function ContaCoopConfirmarPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm">Carregando…</div>}>
      <ConfirmarContent />
    </Suspense>
  );
}
