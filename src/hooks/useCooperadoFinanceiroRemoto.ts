"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { secureApiFetch } from "@/lib/security/clientSession";
import { HB_A_RECEBER_HIBRIDO_EVENT } from "@/lib/hb-credit/hbAReceberHibrido";
import type { CooperadoFinanceiroRemoto } from "@/lib/cooperado/cooperadoFinanceiroRemotoTypes";

const cache = new Map<string, CooperadoFinanceiroRemoto>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const serverSnapshot = () => null;

/** Uma resposta pequena por sessão; a nuvem calcula o resumo sem processar o operacional no celular. */
type FinanceiroRemotoInput = {
  active: boolean; cooperadoId?: string; cooperativaId?: string; userId?: string; requireFreshOnActivation?: boolean;
};

export function useCooperadoFinanceiroRemotoState(input: FinanceiroRemotoInput) {
  const key = `${input.userId ?? ""}:${input.cooperativaId ?? ""}:${input.cooperadoId ?? ""}`;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const proof = useMemo(() => ({ verified: false }), [key, input.active, attempt]);
  const retry = useCallback(() => { setAttempt(value => value + 1); }, []);
  const getSnapshot = useCallback(() => cache.get(key) ?? null, [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  useEffect(() => {
    if (!input.active || !input.cooperadoId || !input.cooperativaId || !input.userId) return;
    let cancelled = false, waitQueued = false;
    const refresh = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (!navigator.onLine) { setError('Sem conexão. Conecte-se para conferir o saldo atualizado.'); return; }
      const running = pending.get(key);
      if (running) {
        if (input.requireFreshOnActivation && !proof.verified && !waitQueued) {
          waitQueued = true;
          void running.then(() => { waitQueued = false; if (!cancelled && !proof.verified) refresh(); });
        }
        return;
      }
      setError(null);
      const request = (async () => {
        try {
          const response = await secureApiFetch("/api/cooperado/financeiro", { cache: "no-store", signal: AbortSignal.timeout(45_000) });
          if (!response.ok) throw Error("Não foi possível conferir o saldo na nuvem. Tente novamente.");
          const payload = await response.json() as CooperadoFinanceiroRemoto;
          if (payload.cooperativaId !== input.cooperativaId || (payload.sessionUserId && payload.sessionUserId !== input.userId) || !Number.isFinite(payload.paridade?.valorLiquido)) throw Error("A consulta financeira não foi confirmada.");
          // Resposta vinculada ao JWT; uma troca de sessão não pode atualizar a tela anterior.
          if (cancelled) return;
          proof.verified = true;
          cache.set(key, payload);
          for (const listener of listeners) listener();
        } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Não foi possível conferir o saldo na nuvem."); }
      })().finally(() => pending.delete(key));
      pending.set(key, request);
    };
    const initial = input.requireFreshOnActivation ? null : window.setTimeout(refresh, 800);
    if (input.requireFreshOnActivation) refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener(HB_A_RECEBER_HIBRIDO_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      if (initial !== null) window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(HB_A_RECEBER_HIBRIDO_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, input.active, input.cooperadoId, input.cooperativaId, input.userId, input.requireFreshOnActivation, attempt, proof]);
  const fresh = proof.verified;
  return { data: input.requireFreshOnActivation && !fresh ? null : snapshot, error, retry };
}

export function useCooperadoFinanceiroRemoto(input: FinanceiroRemotoInput): CooperadoFinanceiroRemoto | null {
  return useCooperadoFinanceiroRemotoState(input).data;
}
