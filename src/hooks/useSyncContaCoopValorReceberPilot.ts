import { useEffect, useRef, useState } from "react";
import type { User } from "@/types";
import {
  refreshContaCoopValorReceberPilot,
  type SyncContaCoopValorReceberOpts,
} from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

const SYNC_INTERVAL_MS = 45_000;

type HookOpts = {
  cooperadoId?: string;
  mesReferencia?: string;
  cooperativaId?: string;
  cooperadoNome?: string;
  user?: Pick<User, "cooperativaCnpj" | "cooperativaId" | "id"> | null;
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
    opts?.cooperadoId && opts.mesReferencia && opts.cooperativaId && cnpj
      ? {
          cnpj,
          cooperadoId: opts.cooperadoId,
          mesReferencia: opts.mesReferencia,
          cooperativaId: opts.cooperativaId,
          cooperadoNome: opts.cooperadoNome,
        }
      : undefined;

  useEffect(() => {
    const syncOpts = optsRef.current;
    if (!syncOpts || !isContaCoopValorReceberPilot(syncOpts.cooperadoId, syncOpts.cooperadoNome)) return;

    let cancelled = false;

    const run = () => {
      const current = optsRef.current;
      if (!current?.cnpj || cancelled || typeof navigator === "undefined" || !navigator.onLine) return;
      void refreshContaCoopValorReceberPilot(current).catch(() => {
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
    opts?.cooperadoNome,
    opts?.cooperativaId,
    opts?.mesReferencia,
  ]);
}
