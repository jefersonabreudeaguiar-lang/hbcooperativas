"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { LabShell, LabPrimaryButton } from "@/modules/hb-credit-lab/components/LabShell";
import { formatCentsBRL } from "@/modules/hb-credit-lab/engine/money";
import type { LabCreditTransaction } from "@/modules/hb-credit-lab/types";

function ComprovanteContent() {
  const params = useSearchParams();
  const [tx, setTx] = useState<LabCreditTransaction | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem("hb_lab_receipt");
    if (cached) {
      try {
        setTx(JSON.parse(cached) as LabCreditTransaction);
      } catch {
        /* ignore */
      }
    }
  }, [params]);

  return (
    <LabShell title="Comprovante experimental" subtitle="Sem valor legal ou financeiro real.">
      <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-5 text-center">
        <CheckCircle2 className="mx-auto text-teal-300" size={40} />
        <p className="mt-3 font-semibold">Pagamento autorizado (lab)</p>
        {tx && (
          <div className="mt-4 space-y-2 text-sm text-left">
            <p>
              <span className="text-slate-400">Valor: </span>
              {formatCentsBRL(tx.amountCents)}
            </p>
            <p>
              <span className="text-slate-400">Código: </span>
              {tx.receiptCode}
            </p>
            <p>
              <span className="text-slate-400">ID: </span>
              <span className="text-xs break-all">{tx.id}</span>
            </p>
          </div>
        )}
      </div>
      <div className="mt-6 space-y-2">
        <LabPrimaryButton href="/lab/conta-coop">Voltar à Conta Coop</LabPrimaryButton>
        <Link href="/lab/mercado/painel" className="block text-center text-sm text-teal-300 underline">
          Ver recebíveis no Mercado Lab
        </Link>
      </div>
    </LabShell>
  );
}

export default function ComprovantePage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Carregando…</div>}>
      <ComprovanteContent />
    </Suspense>
  );
}
