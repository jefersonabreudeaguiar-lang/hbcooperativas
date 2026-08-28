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
        if (!cancelled) setServerEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    // Fail-closed: só liga UI quando o servidor confirma (autoridade real).
    enabled: serverEnabled === true,
    loading: serverEnabled === null,
    clientFlag,
  };
}
