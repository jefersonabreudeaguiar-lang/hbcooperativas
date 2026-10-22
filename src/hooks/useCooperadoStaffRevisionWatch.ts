"use client";

import { useEffect, useRef } from "react";
import { isCooperadoEventDrivenSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { cooperadoPwaSuppressForegroundStaleCheck } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { fetchMyCooperadoLancamentoHint } from "@/lib/cooperado/cooperadoLancamentoHint";
import { pullOperacionalAfterCooperadoLancamentoHint } from "@/lib/cooperado/cooperadoStaffHintOperacionalSync";
import { getSession } from "@/services/dataStore";

/** Consulta leve na nuvem enquanto o app está em uso. */
const REVISION_POLL_MS = 2 * 60_000;
const REVISION_POLL_MESSENGER_MS = 5 * 60_000;
const MIN_GAP_BETWEEN_CHECKS_MS = 20_000;
const MIN_GAP_BETWEEN_CHECKS_MESSENGER_MS = 12_000;
const MIN_GAP_FOREGROUND_MS = 8_000;
const MIN_GAP_FOREGROUND_MESSENGER_MS = 5_000;
const HINT_POLL_MS = 4_000;

function hintAppliedKey(cooperadoId: string): string {
  return `hb-coop-lancamento-hint-at:${cooperadoId}`;
}

function readAppliedHintAt(cooperadoId: string): number {
  if (typeof window === "undefined") return 0;
  const n = Number(localStorage.getItem(hintAppliedKey(cooperadoId)) ?? "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function persistAppliedHintAt(cooperadoId: string, atMs: number): void {
  if (typeof window === "undefined" || !atMs) return;
  localStorage.setItem(hintAppliedKey(cooperadoId), String(atMs));
}

type Opts = {
  cnpj: string | null | undefined;
  cooperadoId?: string | null;
  cooperativaId?: string | null;
  enabled: boolean;
  syncing: boolean;
};

/**
 * Cooperado event-driven: detecta lançamentos do responsável (operacional/notas)
 * e dispara uma sync — sem polling agressivo nem sync em idle/online genérico.
 */
export function useCooperadoStaffRevisionWatch({
  cnpj,
  cooperadoId,
  cooperativaId,
  enabled,
  syncing,
}: Opts) {
  const lastCheckAtRef = useRef(0);
  const lastForegroundAtRef = useRef(0);
  const lastHintAtRef = useRef(0);
  const hintInflightRef = useRef(false);
  const syncingRef = useRef(syncing);
  syncingRef.current = syncing;

  useEffect(() => {
    if (!enabled || !isCooperadoEventDrivenSync()) return;
    const digits = (cnpj ?? "").replace(/\D/g, "");
    if (digits.length !== 14) return;

    let cancelled = false;
    let intervalId = 0;
    let hintIntervalId = 0;

    const messenger = isCooperadoPwaMessengerMode();
    const pollMs = messenger ? REVISION_POLL_MESSENGER_MS : REVISION_POLL_MS;
    const gapBg = messenger ? MIN_GAP_BETWEEN_CHECKS_MESSENGER_MS : MIN_GAP_BETWEEN_CHECKS_MS;
    const gapFg = messenger ? MIN_GAP_FOREGROUND_MESSENGER_MS : MIN_GAP_FOREGROUND_MS;
    if (cooperadoId) {
      lastHintAtRef.current = readAppliedHintAt(cooperadoId);
    }

    const check = async (foreground: boolean) => {
      if (cancelled || syncingRef.current) return;
      if (messenger && cooperadoPwaSuppressForegroundStaleCheck()) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      const minGap = foreground ? gapFg : gapBg;
      if (now - lastCheckAtRef.current < minGap) return;
      if (foreground && now - lastForegroundAtRef.current < gapFg) return;
      lastCheckAtRef.current = now;
      if (foreground) lastForegroundAtRef.current = now;

      await runCooperadoForegroundOperacionalCheck(digits, {
        cooperadoId: cooperadoId ?? undefined,
        cooperativaId: cooperativaId ?? undefined,
      });
    };

    const checkHint = async () => {
      if (cancelled || hintInflightRef.current) return;
      if (syncingRef.current) return;
      if (!cooperadoId || !cooperativaId) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (typeof document !== "undefined" && document.hidden) return;
      hintInflightRef.current = true;
      try {
        const hint = await fetchMyCooperadoLancamentoHint({ cnpj: digits, cooperadoId });
        if (cancelled || !hint) return;
        const atMs = Date.parse(hint.at);
        if (!Number.isFinite(atMs) || atMs <= lastHintAtRef.current) return;
        const session = getSession();
        if (!session || session.role !== "cooperado") return;
        const outcome = await pullOperacionalAfterCooperadoLancamentoHint({
          cnpj: digits,
          cooperativaId,
          user: session,
        });
        if (cancelled || outcome.status !== "synced") return;
        lastHintAtRef.current = atMs;
        persistAppliedHintAt(cooperadoId, atMs);
      } catch {
        /* próximo ciclo de 4s tenta de novo */
      } finally {
        hintInflightRef.current = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void checkHint();
        void check(true);
      }
    };

    const bootDelay = messenger ? 90_000 : 25_000;
    const bootTimer = window.setTimeout(() => void check(true), bootDelay);
    intervalId = window.setInterval(() => void check(false), pollMs);
    hintIntervalId = window.setInterval(() => void checkHint(), HINT_POLL_MS);
    void checkHint();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(bootTimer);
      if (intervalId) window.clearInterval(intervalId);
      if (hintIntervalId) window.clearInterval(hintIntervalId);
    };
  }, [cnpj, cooperadoId, cooperativaId, enabled, syncing]);
}
