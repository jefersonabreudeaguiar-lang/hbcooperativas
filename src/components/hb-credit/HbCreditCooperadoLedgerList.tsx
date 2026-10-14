"use client";

import { ArrowDownLeft, ArrowUpRight, Store, Sparkles } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import type { ContaCoopLedgerEntry } from "@/modules/hb-credit/types";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { formatLedgerEntryLabel } from "@/lib/hb-credit/ledgerLabels";
import { cn } from "@/utils/format";
import { hbCooperadoLedgerRow, hbCooperadoSurfaceCard } from "@/lib/hb-credit/hbCreditCooperadoUi";

type Props = {
  entries: ContaCoopLedgerEntry[];
  loading: boolean;
};

function ledgerIcon(tipo: string, amountCents: number) {
  const t = String(tipo);
  if (t.includes("CASHBACK")) return Sparkles;
  if (amountCents < 0) return ArrowUpRight;
  return t === "PAYMENT" || t === "REFUND" ? Store : ArrowDownLeft;
}

function mercadoSubtitle(entry: ContaCoopLedgerEntry): string | null {
  const mercado = entry.parceiroNome?.trim();
  if (mercado) return mercado;
  if (entry.memo && String(entry.tipo) !== "PAYMENT") {
    const m = entry.memo.trim();
    if (m && !/^\d+$/.test(m)) return m;
  }
  if (entry.memo && String(entry.tipo) === "PAYMENT" && !/^\d+$/.test(entry.memo.trim())) {
    return entry.memo.trim();
  }
  return null;
}

export function HbCreditCooperadoLedgerList({ entries, loading }: Props) {
  if (loading && !entries.length) {
    return (
      <div className={cn(hbCooperadoSurfaceCard, "px-4 py-10")}>
        <PageSkeleton />
        <p className="mt-3 text-center text-xs text-gray-500">Carregando movimentações…</p>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div
        className={cn(
          hbCooperadoSurfaceCard,
          "px-6 py-14 text-center"
        )}
      >
        <p className="text-sm font-medium text-gray-800">Nenhuma movimentação ainda</p>
        <p className="mt-1 text-xs text-gray-500">Pagamentos e ajustes do seu crédito aparecem aqui.</p>
      </div>
    );
  }

  return (
    <div className={cn(hbCooperadoSurfaceCard, "overflow-hidden")}>
      <div className="divide-y divide-emerald-100/80">
        {entries.map((entry) => {
          const Icon = ledgerIcon(String(entry.tipo), entry.amountCents);
          const subtitle = mercadoSubtitle(entry);
          const isDebit = entry.amountCents < 0;
          return (
            <div key={entry.id} className={hbCooperadoLedgerRow}>
              <div className="flex min-w-0 flex-1 gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    isDebit ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                  )}
                  aria-hidden
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 leading-snug">{formatLedgerEntryLabel(entry)}</p>
                  {subtitle && (
                    <p className="mt-0.5 truncate text-xs font-medium text-emerald-800/80">{subtitle}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(entry.createdAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <p
                className={cn(
                  "shrink-0 text-base font-bold tabular-nums pt-0.5",
                  isDebit ? "text-red-600" : "text-emerald-700"
                )}
              >
                {formatCentsBRL(entry.amountCents)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
