import { useEffect, useRef } from "react";
import { fetchCreditLimitesRevision } from "@/services/creditApiService";

const POLL_INTERVAL_MS = 20_000;

type Opts = {
  cnpj: string;
  enabled?: boolean;
  onRevisionChange: () => void;
};

/** Poll leve — responsável vê pagamentos/liberações de outro dispositivo ou do app cooperado. */
export function useHbCreditLimitesRevisionPoll(opts?: Opts) {
  const revisionRef = useRef<string | null>(null);
  const onChangeRef = useRef(opts?.onRevisionChange);
  onChangeRef.current = opts?.onRevisionChange;

  useEffect(() => {
    revisionRef.current = null;
  }, [opts?.cnpj]);

  useEffect(() => {
    if (!opts?.cnpj || opts.cnpj.length !== 14 || opts.enabled === false) return;

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
        const rev = await fetchCreditLimitesRevision(opts.cnpj);
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
  }, [opts?.cnpj, opts?.enabled]);
}
