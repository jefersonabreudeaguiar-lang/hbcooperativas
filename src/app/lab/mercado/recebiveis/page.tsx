"use client";

import { useEffect, useState } from "react";
import { LabShell } from "@/modules/hb-credit-lab/components/LabShell";
import { formatCentsBRL } from "@/modules/hb-credit-lab/engine/money";
import type { LabMarketReceivable } from "@/modules/hb-credit-lab/types";

export default function MercadoRecebiveisPage() {
  const [items, setItems] = useState<LabMarketReceivable[]>([]);

  useEffect(() => {
    fetch("/api/lab/credit/receivables?marketId=LAB_ONLY_market_a")
      .then((r) => r.json())
      .then((json) => setItems(json.receivables ?? []));
  }, []);

  return (
    <LabShell title="Recebíveis simulados" subtitle="Pendentes de liquidação pela cooperativa (futuro)." backHref="/lab/mercado/painel">
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum recebível ainda. Gere uma venda e pague na Conta Coop.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm flex justify-between">
              <span>{r.status === "pending_settlement" ? "Pendente" : "Liquidado"}</span>
              <span className="font-semibold tabular-nums">{formatCentsBRL(r.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </LabShell>
  );
}
