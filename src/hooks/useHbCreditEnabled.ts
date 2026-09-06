"use client";

import { useCallback, useEffect, useState } from "react";
import { isHbCreditEnabledClient } from "@/modules/hb-credit/config";

export type HbCreditFlagStatus = "loading" | "enabled" | "disabled" | "error";

export interface HbCreditFlagState {
  /** Módulo habilitado e confirmado pelo servidor — use para menu e gates. */
  enabled: boolean;
  status: HbCreditFlagStatus;
  loading: boolean;
  clientFlag: boolean;
  serverConfirmed: boolean;
  errorMessage: string | null;
}

const STATUS_FETCH_TIMEOUT_MS = 12_000;

export function useHbCreditEnabled(): HbCreditFlagState {
  const clientFlag = isHbCreditEnabledClient();
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/credit/status", { cache: "no-store", signal });
      if (!res.ok) {
        setServerEnabled(null);
        setErrorMessage(`Status HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { enabled?: boolean };
      setServerEnabled(data.enabled === true);
      setErrorMessage(null);
    } catch (e) {
      if (signal.aborted) return;
      setServerEnabled(null);
      setErrorMessage(e instanceof Error ? e.message : "Falha de rede ao consultar status.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);

    void fetchStatus(controller.signal);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [fetchStatus]);

  let status: HbCreditFlagStatus;
  if (serverEnabled === null && !errorMessage) {
    status = "loading";
  } else if (errorMessage) {
    status = "error";
  } else if (serverEnabled === true) {
    status = "enabled";
  } else {
    status = "disabled";
  }

  /** Visibilidade exige confirmação explícita do servidor — fail-closed. */
  const enabled = status === "enabled";

  return {
    enabled,
    status,
    loading: status === "loading",
    clientFlag,
    serverConfirmed: serverEnabled === true,
    errorMessage,
  };
}

/** Menu HB Créditos: reexporta regra central de permissions. */
export { isHbCreditNavVisible } from "@/permissions";
