"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import {
  lerHbCreditAccountPersistidoFlex,
  type HbCreditAccountPersistido,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import { HB_CREDIT_LIMITE_SYNCED_EVENT } from "@/lib/hb-credit/hbCreditLimiteSyncEvents";

type Props = {
  cnpj: string;
};

export function CooperadoHbCreditResumoCard({ cnpj }: Props) {
  const { cooperadoId } = usePermissions();
  const [snap, setSnap] = useState<HbCreditAccountPersistido | null>(null);

  useEffect(() => {
    if (!cooperadoId || cnpj.length !== 14) {
      setSnap(null);
      return;
    }
    const refresh = () => setSnap(lerHbCreditAccountPersistidoFlex(cooperadoId, cnpj));
    refresh();
    window.addEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, refresh);
    return () => window.removeEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, refresh);
  }, [cooperadoId, cnpj]);

  const totals = useMemo(() => {
    const acc = snap?.account;
    if (!acc) return null;
    const credito = acc.valorDisponivelCents ?? 0;
    const cashback = acc.cashbackDisponivelCents ?? 0;
    return {
      paraPagar: credito + cashback,
      credito,
      cashback,
      limite: acc.limiteLiberadoCents ?? 0,
      usado: acc.valorUsadoCents ?? 0,
    };
  }, [snap]);

  if (!totals) {
    return (
      <Link
        href="/minha-conta-coop"
        className="flex items-center gap-4 rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 px-5 py-4 hover:border-emerald-300 transition-colors"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-700 text-white shrink-0">
          <Wallet size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-gray-900">HB Créditos</span>
          <span className="block text-sm text-gray-600 mt-0.5">Abrir para ver limite e pagar com QR</span>
        </span>
        <span className="text-sm font-semibold text-emerald-800 shrink-0">Abrir →</span>
      </Link>
    );
  }

  return (
    <Link
      href="/minha-conta-coop"
      className="block overflow-hidden rounded-2xl border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-800 via-green-700 to-teal-700 p-5 text-white shadow-md hover:border-emerald-200 transition-colors"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
          <Wallet size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">HB Créditos</p>
          <p className="mt-1 text-sm text-emerald-50/90">Disponível para pagar nos mercados parceiros</p>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{formatCentsBRL(totals.paraPagar)}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-100/90">
            <span>Crédito {formatCentsBRL(totals.credito)}</span>
            {totals.cashback > 0 && <span>Cashback {formatCentsBRL(totals.cashback)}</span>}
            {totals.usado > 0 && <span>Em uso {formatCentsBRL(totals.usado)}</span>}
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-white/90 pt-1">Detalhes →</span>
      </div>
    </Link>
  );
}
