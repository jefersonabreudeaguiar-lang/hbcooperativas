import { useEffect, useRef, useState } from "react";
import type { User } from "@/types";
import {
  refreshContaCoopValorReceberPilot,
  type SyncContaCoopValorReceberOpts,
} from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import { scheduleContaCoopAuxSync } from "@/lib/hb-credit/contaCoopAuxSyncSchedule";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

const SYNC_INTERVAL_MS = 90_000;
const DEFAULT_INITIAL_DELAY_MS = 8_000;

type HookOpts = {
  cooperadoId?: string;
  mesReferencia?: string;
  cooperativaId?: string;
  cooperadoNome?: string;
  user?: Pick<User, "cooperativaCnpj" | "cooperativaId" | "id"> | null;
  /** Quando false, não dispara sync (ex.: aguardando fetchCreditAccount na HB). */
  enabled?: boolean;
  initialDelayMs?: number;
};

/** Mantém o abatimento HB Créditos → valor a receber sincronizado (todos os cooperados). */
export function useSyncContaCoopValorReceberPilot(opts?: HookOpts) {
  const [cnpj, setCnpj] = useState("");
  const optsRef = useRef<SyncContaCoopValorReceberOpts | undefined>(undefined);

  useEffect(() => {
    if (!opts?.cooperativaId || !opts.user) {
      setCnpj("");
      return;
    }
    let cancelled = false;
    void resolveCooperativaCnpj(getData(), opts.cooperativaId, opts.user).then((resolved) => {
      if (!cancelled) setCnpj(resolved ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [opts?.cooperativaId, opts?.user?.id]);

  optsRef.current =
    opts?.cooperadoId && opts.mesReferencia && opts.cooperativaId && cnpj && opts.enabled !== false
      ? {
          cnpj,
          cooperadoId: opts.cooperadoId,
          mesReferencia: opts.mesReferencia,
          cooperativaId: opts.cooperativaId,
          cooperadoNome: opts.cooperadoNome,
        }
      : undefined;

  useEffect(() => {
    if (isCooperadoPwaMessengerMode()) return;

    const syncOpts = optsRef.current;
    if (!syncOpts || !isContaCoopValorReceberPilot(syncOpts.cooperadoId, syncOpts.cooperadoNome)) return;

    let cancelled = false;
    let intervalId = 0;
    let delayId = 0;
    const idleCleanups: Array<() => void> = [];

    const run = () => {
      const current = optsRef.current;
      if (
        !current?.cnpj ||
        cancelled ||
        typeof navigator === "undefined" ||
        !navigator.onLine ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      const cancelIdle = scheduleContaCoopAuxSync(
        () => {
          if (cancelled) return;
          void refreshContaCoopValorReceberPilot(current).catch(() => {
            /* offline ou HB indisponível */
          });
        },
        { idleTimeoutMs: 12_000, fallbackMs: 4_000 }
      );
      idleCleanups.push(cancelIdle);
    };

    const startInterval = () => {
      if (cancelled) return;
      run();
      intervalId = window.setInterval(run, SYNC_INTERVAL_MS);
    };

    const delay = Math.max(0, opts?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS);
    delayId = window.setTimeout(startInterval, delay);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (delayId) window.clearTimeout(delayId);
      if (intervalId) window.clearInterval(intervalId);
      for (const cleanup of idleCleanups) cleanup();
    };
  }, [
    cnpj,
    opts?.cooperadoId,
    opts?.cooperadoNome,
    opts?.cooperativaId,
    opts?.mesReferencia,
    opts?.enabled,
    opts?.initialDelayMs,
  ]);
}
