import { useEffect, useRef, useState } from "react";
import type { User } from "@/types";
import { refreshContaCoopDescontosCooperativaPendentes } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

const SYNC_INTERVAL_MS = 120_000;
const SYNC_INITIAL_DELAY_MS = 2_000;

type HookOpts = {
  cooperativaId?: string;
  user?: Pick<User, "cooperativaCnpj" | "cooperativaId" | "id" | "role"> | null;
  enabled?: boolean;
};

/** Sincroniza abatimentos HB Créditos em background — só relatórios em aberto, sem bloquear sync principal. */
export function useSyncContaCoopValorReceberCooperativa(opts?: HookOpts) {
  const [cnpj, setCnpj] = useState("");
  const runningRef = useRef(false);
  const optsRef = useRef<{ cnpj: string; cooperativaId: string } | undefined>(undefined);

  useEffect(() => {
    if (!opts?.cooperativaId || !opts.user || opts.enabled === false) {
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
  }, [opts?.cooperativaId, opts?.user?.id, opts?.enabled]);

  optsRef.current =
    opts?.cooperativaId && cnpj && opts.enabled !== false && isContaCoopValorReceberPilot()
      ? { cnpj, cooperativaId: opts.cooperativaId }
      : undefined;

  useEffect(() => {
    const syncOpts = optsRef.current;
    if (!syncOpts?.cnpj) return;

    let cancelled = false;

    const run = () => {
      const current = optsRef.current;
      if (
        !current?.cnpj ||
        cancelled ||
        runningRef.current ||
        typeof navigator === "undefined" ||
        !navigator.onLine
      ) {
        return;
      }
      runningRef.current = true;
      void refreshContaCoopDescontosCooperativaPendentes(current)
        .catch(() => {
          /* offline ou HB indisponível */
        })
        .finally(() => {
          runningRef.current = false;
        });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(run, SYNC_INTERVAL_MS);
    const initial = window.setTimeout(run, SYNC_INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      window.clearTimeout(initial);
    };
  }, [cnpj, opts?.cooperativaId, opts?.enabled]);
}
