"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { hbCreditEffectiveDisponivelCents } from "@/modules/hb-credit/engine/paymentAffordability";
import {
  lerHbCreditAccountPersistido,
  lerHbCreditAccountPersistidoFlex,
  type HbCreditAccountPersistido,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import {
  HB_CREDIT_ACCOUNT_CACHE_EVENT,
  HB_CREDIT_LIMITE_SYNCED_EVENT,
} from "@/lib/hb-credit/hbCreditLimiteSyncEvents";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { fetchCreditAccount } from "@/services/creditApiService";
import {
  gravarHbCreditAccountPersistido,
  HB_CREDIT_ACCOUNT_STORAGE_VERSION,
} from "@/lib/hb-credit/hbCreditAccountPersistencia";
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

type Props = {
  cnpj: string;
};

export function CooperadoHbCreditResumoCard({ cnpj }: Props) {
  const { user, cooperadoId } = usePermissions();
  const hbApiCooperadoId = resolveHbCreditApiCooperadoId(user, cooperadoId);
  const [snap, setSnap] = useState<HbCreditAccountPersistido | null>(null);

  useEffect(() => {
    if (!hbApiCooperadoId || cnpj.length !== 14) {
      setSnap(null);
      return;
    }
    const refreshFromCache = () =>
      setSnap(
        lerHbCreditAccountPersistido(cnpj, hbApiCooperadoId) ??
          lerHbCreditAccountPersistidoFlex(hbApiCooperadoId, cnpj) ??
          (cooperadoId && cooperadoId !== hbApiCooperadoId
            ? lerHbCreditAccountPersistido(cnpj, cooperadoId) ??
              lerHbCreditAccountPersistidoFlex(cooperadoId, cnpj)
            : null)
      );
    refreshFromCache();

    const syncFromCloud = async () => {
      if (user?.role === "cooperado") {
        await persistirHbCreditAccountCooperado(user);
        refreshFromCache();
        return;
      }
      try {
        const acc = await fetchCreditAccount(cnpj, hbApiCooperadoId);
        const account = (acc.account as ContaCoopLimiteCooperado | null) ?? null;
        const payload: HbCreditAccountPersistido = {
          v: HB_CREDIT_ACCOUNT_STORAGE_VERSION,
          account,
          updatedAt: acc.updatedAt ?? null,
          hasPin: Boolean(acc.hasPin),
          pinResetPending: Boolean(acc.pinResetPending),
          savedAt: new Date().toISOString(),
        };
        gravarHbCreditAccountPersistido(cnpj, hbApiCooperadoId, payload);
        setSnap(payload);
      } catch {
        refreshFromCache();
      }
    };

    void syncFromCloud();

    const onCache = () => refreshFromCache();
    const onCloud = () => {
      refreshFromCache();
      void syncFromCloud();
    };
    window.addEventListener(HB_CREDIT_ACCOUNT_CACHE_EVENT, onCache);
    window.addEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onCloud);
    return () => {
      window.removeEventListener(HB_CREDIT_ACCOUNT_CACHE_EVENT, onCache);
      window.removeEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onCloud);
    };
  }, [hbApiCooperadoId, cooperadoId, cnpj, user]);

  const totals = useMemo(() => {
    const acc = snap?.account;
    if (!acc) return null;
    const liberado = Math.max(0, acc.limiteLiberadoCents ?? 0);
    const usado = Math.max(0, acc.valorUsadoCents ?? 0);
    const creditoEfetivo = hbCreditEffectiveDisponivelCents(liberado, liberado, usado);
    const creditoInformado = Math.max(0, acc.valorDisponivelCents ?? 0);
    const credito = Math.min(creditoInformado, creditoEfetivo);
    const cashback = acc.cashbackDisponivelCents ?? 0;
    return {
      paraPagar: credito + cashback,
      credito,
      cashback,
      limite: liberado,
      usado,
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
            {totals.cashback > 0 && <span>Cashback {formatCentsBRL(totals.cashback)}</span>}
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-white/90 pt-1">Detalhes →</span>
      </div>
    </Link>
  );
}
