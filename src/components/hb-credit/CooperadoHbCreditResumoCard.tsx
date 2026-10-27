"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, startTransition, type MouseEvent } from "react";
import { Wallet } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { resolveHbCreditApiCooperadoId } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import { formatCentsBRL } from "@/modules/hb-credit/engine/money";
import { normalizeHbPaymentLimiteDisponivel } from "@/modules/hb-credit/engine/paymentAffordability";
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
import { resolveCooperadoHbCreditCnpjDigits } from "@/lib/hb-credit/resolveCooperadoHbCreditCnpj";
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";
import { clearCooperadoOptimisticTab } from "@/lib/performance/cooperadoOptimisticTabNavigation";
import { isV2HbOnlyClient } from "@/lib/product/v2HbOnly";
import { hbCreditCooperadoInicioV2Totais } from "@/lib/hb-credit/hbCreditCooperadoInicioV2";

type Props = {
  cnpj: string;
};

export function CooperadoHbCreditResumoCard({ cnpj }: Props) {
  const router = useRouter();
  const { user, cooperadoId } = usePermissions();
  const hbApiCooperadoId = resolveHbCreditApiCooperadoId(user, cooperadoId);
  const cnpjResolved = useMemo(() => {
    if (cnpj.length === 14) return cnpj;
    return resolveCooperadoHbCreditCnpjDigits(user);
  }, [cnpj, user]);
  const [snap, setSnap] = useState<HbCreditAccountPersistido | null>(null);

  /** Push explícito — Link sozinho falha depois do replaceState das abas. */
  const onHbNavClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      clearCooperadoOptimisticTab();
      startTransition(() => {
        router.push("/minha-conta-coop");
      });
    },
    [router]
  );

  useEffect(() => {
    try {
      router.prefetch("/minha-conta-coop");
    } catch {
      /* ignore */
    }
  }, [router]);

  useEffect(() => {
    if (!hbApiCooperadoId) {
      setSnap(null);
      return;
    }
    const readCache = (): HbCreditAccountPersistido | null =>
      (cnpjResolved.length === 14
        ? lerHbCreditAccountPersistido(cnpjResolved, hbApiCooperadoId)
        : null) ??
      lerHbCreditAccountPersistidoFlex(hbApiCooperadoId, cnpjResolved || undefined) ??
      (cooperadoId && cooperadoId !== hbApiCooperadoId
        ? (cnpjResolved.length === 14
            ? lerHbCreditAccountPersistido(cnpjResolved, cooperadoId)
            : null) ?? lerHbCreditAccountPersistidoFlex(cooperadoId, cnpjResolved || undefined)
        : null);

    const refreshFromCache = () => setSnap(readCache());
    refreshFromCache();

    const syncAccountFromCloud = async () => {
      if (user?.role === "cooperado") {
        await persistirHbCreditAccountCooperado(user);
        refreshFromCache();
        return;
      }
      if (cnpjResolved.length !== 14) return;
      try {
        const acc = await fetchCreditAccount(cnpjResolved, hbApiCooperadoId);
        const account = (acc.account as ContaCoopLimiteCooperado | null) ?? null;
        const payload: HbCreditAccountPersistido = {
          v: HB_CREDIT_ACCOUNT_STORAGE_VERSION,
          account,
          updatedAt: acc.updatedAt ?? null,
          hasPin: Boolean(acc.hasPin),
          pinResetPending: Boolean(acc.pinResetPending),
          savedAt: new Date().toISOString(),
        };
        gravarHbCreditAccountPersistido(cnpjResolved, hbApiCooperadoId, payload);
        setSnap(payload);
      } catch {
        refreshFromCache();
      }
    };

    void syncAccountFromCloud();

    const onCache = () => refreshFromCache();
    const onLimiteSynced = () => {
      refreshFromCache();
      void syncAccountFromCloud();
    };
    window.addEventListener(HB_CREDIT_ACCOUNT_CACHE_EVENT, onCache);
    window.addEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
    return () => {
      window.removeEventListener(HB_CREDIT_ACCOUNT_CACHE_EVENT, onCache);
      window.removeEventListener(HB_CREDIT_LIMITE_SYNCED_EVENT, onLimiteSynced);
    };
  }, [hbApiCooperadoId, cooperadoId, cnpjResolved, user]);

  const v2Hb = isV2HbOnlyClient();

  const totals = useMemo(() => {
    const acc = snap?.account;
    if (!acc) return null;
    if (v2Hb) {
      const v2 = hbCreditCooperadoInicioV2Totais(acc);
      if (!v2) return null;
      return {
        saldo: v2.saldoMercadoCents,
        limite: v2.limiteLiberadoCents,
        usado: v2.usadoCents,
        brutoFicha: v2.brutoFichaCents,
        aReceber: v2.aReceberCents,
      };
    }
    const norm = normalizeHbPaymentLimiteDisponivel(acc);
    return {
      saldo: norm.valorDisponivelCents,
      limite: norm.limiteLiberadoCents,
      usado: Math.max(0, norm.valorUsadoCents ?? 0),
      brutoFicha: null as number | null,
      aReceber: null as number | null,
    };
  }, [snap, v2Hb]);

  if (!totals) {
    return (
      <Link
        href="/minha-conta-coop"
        onClick={onHbNavClick}
        className="flex items-center gap-4 rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 px-5 py-4 hover:border-emerald-300 transition-colors"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-700 text-white shrink-0">
          <Wallet size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-gray-900">HB Créditos</span>
          <span className="block text-sm text-gray-600 mt-0.5">Abrir para ver saldo e pagar com QR</span>
        </span>
        <span className="text-sm font-semibold text-emerald-800 shrink-0">Abrir →</span>
      </Link>
    );
  }

  return (
    <Link
      href="/minha-conta-coop"
      onClick={onHbNavClick}
      className="block overflow-hidden rounded-2xl border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-800 via-green-700 to-teal-700 p-5 text-white shadow-md hover:border-emerald-200 transition-colors"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
          <Wallet size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">HB Créditos</p>
          <p className="mt-1 text-sm text-emerald-50/90">
            {v2Hb
              ? "Base na ficha HB (entregas 1–5) — saldo para mercados parceiros"
              : "Saldo para pagar nos mercados parceiros"}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{formatCentsBRL(totals.saldo)}</p>
          {v2Hb && totals.brutoFicha != null ? (
            <p className="mt-2 text-xs text-emerald-100/95 leading-relaxed">
              Ficha bruto {formatCentsBRL(totals.brutoFicha)}
              {totals.aReceber != null ? ` · A receber ${formatCentsBRL(totals.aReceber)}` : ""}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 text-sm font-semibold text-white/90 pt-1">Detalhes →</span>
      </div>
    </Link>
  );
}
