"use client";

import { useEffect, useState } from "react";
import { isHbCreditEnabledClient } from "@/modules/hb-credit/config";

export function useHbCreditEnabled() {
  const clientFlag = isHbCreditEnabledClient();
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(clientFlag ? null : false);

  useEffect(() => {
    if (!clientFlag) {
      setServerEnabled(false);
      return;
    }

    let cancelled = false;
    fetch("/api/credit/status")
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
  }, [clientFlag]);

  return {
    enabled: clientFlag && serverEnabled === true,
    loading: clientFlag && serverEnabled === null,
    clientFlag,
  };
}
