"use client";

import { useEffect, useState } from "react";
import { LabShell } from "@/modules/hb-credit-lab/components/LabShell";
import { formatCentsBRL } from "@/modules/hb-credit-lab/engine/money";
import type { LabLedgerEntry } from "@/modules/hb-credit-lab/types";

export default function ExtratoPage() {
  const [ledger, setLedger] = useState<LabLedgerEntry[]>([]);

  useEffect(() => {
    fetch("/api/lab/credit/account?view=ledger")
      .then((r) => r.json())
      .then((json) => setLedger(json.ledger ?? []));
  }, []);

  return (
    <LabShell title="Extrato" subtitle="Lançamentos append-only do laboratório." backHref="/lab/conta-coop">
      <ul className="space-y-2">
        {ledger.map((e) => (
          <li key={e.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium capitalize">{e.type}</p>
                <p className="text-xs text-slate-400">{e.memo}</p>
              </div>
              <p className={`font-semibold tabular-nums ${e.type === "debit" ? "text-rose-300" : "text-teal-300"}`}>
                {e.type === "debit" ? "-" : "+"}
                {formatCentsBRL(e.amountCents)}
              </p>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Saldo após: {formatCentsBRL(e.balanceAfterCents)}</p>
          </li>
        ))}
      </ul>
    </LabShell>
  );
}
