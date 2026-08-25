"use client";

import { useEffect, useState } from "react";
import { isHbCreditLabEnabledClient } from "@/modules/hb-credit-lab/config";

export function useHbCreditLabEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isHbCreditLabEnabledClient()) {
      setEnabled(false);
      return;
    }
    fetch("/api/lab/credit/status", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => setEnabled(Boolean(json?.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  return enabled;
}
