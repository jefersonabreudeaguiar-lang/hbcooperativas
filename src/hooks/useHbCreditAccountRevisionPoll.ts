import { useEffect, useRef } from "react";
import { fetchCreditAccountRevision } from "@/services/creditApiService";

const POLL_INTERVAL_MS = 45_000;

type Opts = {
  cnpj: string;
  cooperadoId: string;
  enabled?: boolean;
  /** Chamado quando a nuvem mudou (ex.: responsável liberou na aba Limites). */
  onRevisionChange: () => void;
};

/**
 * Poll leve da revisão HB na nuvem — alinha app cooperado com alterações do responsável (outro dispositivo).
 */
export function useHbCreditAccountRevisionPoll(opts?: Opts) {
  const revisionRef = useRef<string | null>(null);
  const onChangeRef = useRef(opts?.onRevisionChange);
  onChangeRef.current = opts?.onRevisionChange;

  useEffect(() => {
    revisionRef.current = null;
  }, [opts?.cnpj, opts?.cooperadoId]);

  useEffect(() => {
    if (!opts?.cnpj || !opts.cooperadoId || opts.enabled === false) return;

    let cancelled = false;
    let intervalId = 0;

    const tick = async () => {
      if (
        cancelled ||
        typeof navigator === "undefined" ||
        !navigator.onLine ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      try {
        const rev = await fetchCreditAccountRevision(opts.cnpj, opts.cooperadoId);
        if (cancelled || !rev?.revision) return;
        const prev = revisionRef.current;
        revisionRef.current = rev.revision;
        if (prev != null && prev !== rev.revision) {
          onChangeRef.current?.();
        }
      } catch {
        /* offline / sessão */
      }
    };

    void tick();
    intervalId = window.setInterval(() => void tick(), POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [opts?.cnpj, opts?.cooperadoId, opts?.enabled]);
}
