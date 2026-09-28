import { useEffect, useRef, useState } from "react";
import type { User } from "@/types";
import {
  refreshContaCoopLimiteFromFicha,
  type SyncContaCoopLimiteOpts,
} from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";
import { scheduleContaCoopAuxSync } from "@/lib/hb-credit/contaCoopAuxSyncSchedule";

const SYNC_INTERVAL_MS = 90_000;

type HookOpts = {
  cooperadoId?: string;
  cooperativaId?: string;
  cooperadoNome?: string;
  cooperadoIds?: string[];
  user?: Pick<User, "cooperativaCnpj" | "cooperativaId" | "id"> | null;
  enabled?: boolean;
  /** Cooperado: adia sync pesado na nuvem para não travar abertura da aba. */
  initialDelayMs?: number;
};

/** Mantém limite HB Créditos = teto% do valor a receber pendente (mesma base do cooperado). */
export function useSyncContaCoopLimiteFromFicha(opts?: HookOpts) {
  const [cnpj, setCnpj] = useState("");
  const optsRef = useRef<SyncContaCoopLimiteOpts | undefined>(undefined);

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

  const pilotOrBulk =
    Boolean(opts?.cooperadoIds?.length) ||
    isContaCoopValorReceberPilot(opts?.cooperadoId, opts?.cooperadoNome);

  optsRef.current =
    opts?.cooperativaId && cnpj && pilotOrBulk && opts.enabled !== false
      ? {
          cnpj,
          cooperadoId: opts.cooperadoId ?? opts.cooperadoIds?.[0] ?? "",
          cooperativaId: opts.cooperativaId,
          cooperadoNome: opts.cooperadoNome,
          cooperadoIds: opts.cooperadoIds,
        }
      : undefined;

  useEffect(() => {
    const syncOpts = optsRef.current;
    if (!syncOpts?.cnpj || !syncOpts.cooperadoId) return;

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
          void refreshContaCoopLimiteFromFicha(current).catch(() => {
            /* offline ou HB indisponível */
          });
        },
        { idleTimeoutMs: 15_000, fallbackMs: 5_000 }
      );
      idleCleanups.push(cancelIdle);
    };

    const startInterval = () => {
      if (cancelled) return;
      run();
      intervalId = window.setInterval(run, SYNC_INTERVAL_MS);
    };

    const delay = Math.max(0, opts?.initialDelayMs ?? 0);
    if (delay > 0) {
      delayId = window.setTimeout(startInterval, delay);
    } else {
      startInterval();
    }

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
    opts?.cooperadoIds?.join(","),
    opts?.cooperadoNome,
    opts?.cooperativaId,
    opts?.enabled,
    opts?.initialDelayMs,
    pilotOrBulk,
  ]);
}
