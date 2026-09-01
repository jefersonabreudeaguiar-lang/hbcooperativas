import { useEffect, useRef, useState } from "react";
import type { User } from "@/types";
import {
  refreshContaCoopLimiteFromFicha,
  type SyncContaCoopLimiteOpts,
} from "@/lib/hb-credit/syncContaCoopLimiteFromFicha";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

const SYNC_INTERVAL_MS = 45_000;

type HookOpts = {
  cooperadoId?: string;
  cooperativaId?: string;
  cooperadoNome?: string;
  cooperadoIds?: string[];
  user?: Pick<User, "cooperativaCnpj" | "cooperativaId" | "id"> | null;
  enabled?: boolean;
};

/** Mantém limite Conta Coop = teto% das entregas pendentes na ficha. */
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

    const run = () => {
      const current = optsRef.current;
      if (!current?.cnpj || cancelled || typeof navigator === "undefined" || !navigator.onLine) return;
      void refreshContaCoopLimiteFromFicha(current).catch(() => {
        /* offline ou HB indisponível */
      });
    };

    run();

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(run, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [
    cnpj,
    opts?.cooperadoId,
    opts?.cooperadoIds?.join(","),
    opts?.cooperadoNome,
    opts?.cooperativaId,
    opts?.enabled,
    pilotOrBulk,
  ]);
}
