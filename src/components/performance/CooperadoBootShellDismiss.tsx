"use client";

import { useEffect } from "react";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

/** Garante remoção do shell estático mesmo se auth ou chunks atrasarem (ex.: preview estreito no Cursor). */
export function CooperadoBootShellDismiss() {
  useEffect(() => {
    dismissCooperadoBootShell();
    const t = window.setTimeout(() => dismissCooperadoBootShell(), 500);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
