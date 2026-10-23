"use client";

import { useEffect, useRef } from "react";
import { isCooperadoEventDrivenSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { runCooperadoForegroundOperacionalCheck } from "@/lib/performance/cooperadoForegroundOperacionalSync";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { cooperadoPwaSuppressForegroundStaleCheck } from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { fetchMyCooperadoLancamentoHint } from "@/lib/cooperado/cooperadoLancamentoHint";
import { runCooperadoMessengerOperacionalLightPull } from "@/lib/cooperado/cooperadoMessengerOperacionalLightPull";
import { watchBicCooperativaCloudRevision } from "@/lib/bic/bicRevisionWatch";
import { getSession } from "@/services/dataStore";

/** Consulta leve na nuvem enquanto o app está em uso. */
const REVISION_POLL_MS = 2 * 60_000;
const REVISION_POLL_MESSENGER_MS = 5 * 60_000;
const MIN_GAP_BETWEEN_CHECKS_MS = 20_000;
const MIN_GAP_BETWEEN_CHECKS_MESSENGER_MS = 12_000;
const MIN_GAP_FOREGROUND_MS = 8_000;
const MIN_GAP_FOREGROUND_MESSENGER_MS = 5_000;
const HINT_POLL_MS = 4_000;
/** Evita pull/revisão repetidos para o mesmo hint enquanto o poll roda a cada 4s. */
const MIN_GAP_HINT_PROCESS_MS = 12_000;
/** Hint na nuvem sem sucesso de sync — para de insistir para não travar o app. */
const HINT_QUARANTINE_MS = 90_000;

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
  const lastHintProcessAtRef = useRef(0);
  const lastHintProcessKeyRef = useRef("");
  const pendingHintFirstSeenAtRef = useRef(0);
  const pendingHintKeyRef = useRef("");
  const syncingRef = useRef(syncing);
  syncingRef.current = syncing;

  useEffect(() => {
    if (!enabled || !isCooperadoEventDrivenSync()) return;
    const digits = (cnpj ?? "").replace(/\D/g, "");
    if (digits.length !== 14) return;

    let cancelled = false;
    let intervalId = 0;

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

    const quarantinePendingHint = (atMs: number, reason: "stale" | "give_up") => {
      if (!cooperadoId || !atMs) return;
      lastHintAtRef.current = atMs;
      persistAppliedHintAt(cooperadoId, atMs);
      pendingHintKeyRef.current = "";
      pendingHintFirstSeenAtRef.current = 0;
      if (reason === "give_up" && typeof console !== "undefined") {
        console.info("[cooperado-hint] hint antigo ignorado para evitar sync em loop");
      }
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

        const hintKey = `${hint.notaId}|${atMs}`;
        const now = Date.now();
        if (hintKey !== pendingHintKeyRef.current) {
          pendingHintKeyRef.current = hintKey;
          pendingHintFirstSeenAtRef.current = now;
        } else if (now - pendingHintFirstSeenAtRef.current >= HINT_QUARANTINE_MS) {
          quarantinePendingHint(atMs, "give_up");
          return;
        }

        if (
          hintKey === lastHintProcessKeyRef.current &&
          now - lastHintProcessAtRef.current < MIN_GAP_HINT_PROCESS_MS
        ) {
          return;
        }
        lastHintProcessKeyRef.current = hintKey;
        lastHintProcessAtRef.current = now;

        const session = getSession();
        if (!session || session.role !== "cooperado") return;
        const remote = await watchBicCooperativaCloudRevision(digits);
        if (!remote) {
          if (now - pendingHintFirstSeenAtRef.current >= HINT_QUARANTINE_MS) {
            quarantinePendingHint(atMs, "stale");
          }
          return;
        }
        const ok = await runCooperadoMessengerOperacionalLightPull({
          cnpj: digits,
          cooperativaId,
          user: session,
          remote,
        });
        if (!ok) {
          if (Date.now() - pendingHintFirstSeenAtRef.current >= HINT_QUARANTINE_MS) {
            quarantinePendingHint(atMs, "give_up");
          }
          return;
        }
        pendingHintKeyRef.current = "";
        pendingHintFirstSeenAtRef.current = 0;
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
    const hintBootTimer = window.setTimeout(() => void checkHint(), 20_000);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(bootTimer);
      if (intervalId) window.clearInterval(intervalId);
      window.clearTimeout(hintBootTimer);
    };
  }, [cnpj, cooperadoId, cooperativaId, enabled]);
}
