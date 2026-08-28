"use client";

import { useEffect, useState } from "react";
import { isHbCreditEnabledClient } from "@/modules/hb-credit/config";

export function useHbCreditEnabled() {
  const clientFlag = isHbCreditEnabledClient();
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/credit/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { enabled?: boolean }) => {
        if (!cancelled) setServerEnabled(data.enabled === true);
      })
      .catch(() => {
        // Falha de rede no PWA: não tratar como OFF definitivo.
        if (!cancelled) setServerEnabled(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const enabled =
    serverEnabled === true ||
    (serverEnabled !== false && clientFlag);

  return {
    // UI: servidor confirma OU flag pública no bundle (PWA). Operações seguem fail-closed na API.
    enabled,
    loading: serverEnabled === null,
    clientFlag,
    serverConfirmed: serverEnabled === true,
  };
}
