"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { secureApiFetch } from "@/lib/security/clientSession";
import { HB_A_RECEBER_HIBRIDO_EVENT } from "@/lib/hb-credit/hbAReceberHibrido";
import type { CooperadoFinanceiroRemoto } from "@/lib/cooperado/cooperadoFinanceiroRemotoTypes";

const cache = new Map<string, CooperadoFinanceiroRemoto>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const serverSnapshot = () => null;

/** Uma resposta pequena por sessão; a nuvem calcula o resumo sem processar o operacional no celular. */
export function useCooperadoFinanceiroRemoto(input: {
  active: boolean; cooperadoId?: string; cooperativaId?: string; userId?: string;
}): CooperadoFinanceiroRemoto | null {
  const key = `${input.userId ?? ""}:${input.cooperativaId ?? ""}:${input.cooperadoId ?? ""}`;
  const getSnapshot = useCallback(() => cache.get(key) ?? null, [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  useEffect(() => {
    if (!input.active || !input.cooperadoId || !input.cooperativaId || !input.userId) return;
    let cancelled = false;
    const refresh = () => {
      if (cancelled || document.visibilityState !== "visible" || !navigator.onLine || pending.has(key)) return;
      const request = (async () => {
        try {
          const response = await secureApiFetch("/api/cooperado/financeiro", { cache: "no-store", signal: AbortSignal.timeout(45_000) });
          if (!response.ok) return;
          const payload = await response.json() as CooperadoFinanceiroRemoto;
          if (payload.cooperativaId !== input.cooperativaId || !Number.isFinite(payload.paridade?.valorLiquido)) return;
          // Resposta vinculada ao JWT; uma troca de sessão não pode atualizar a tela anterior.
          if (cancelled) return;
          const previous = cache.get(key);
          if (previous && JSON.stringify(previous.paridade) === JSON.stringify(payload.paridade)) return;
          cache.set(key, payload);
          for (const listener of listeners) listener();
        } catch { /* mantém a última leitura conhecida durante falha de rede */ }
      })().finally(() => pending.delete(key));
      pending.set(key, request);
    };
    const initial = window.setTimeout(refresh, 800);
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener(HB_A_RECEBER_HIBRIDO_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(initial); window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(HB_A_RECEBER_HIBRIDO_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, input.active, input.cooperadoId, input.cooperativaId, input.userId]);
  return snapshot;
}
