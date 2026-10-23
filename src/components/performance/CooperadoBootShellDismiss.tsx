"use client";

import { useLayoutEffect } from "react";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

/** Garante remoção do shell estático mesmo se auth ou chunks atrasarem (ex.: preview estreito no Cursor). */
export function CooperadoBootShellDismiss() {
  useLayoutEffect(() => {
    dismissCooperadoBootShell();
    const t1 = window.setTimeout(dismissCooperadoBootShell, 500);
    const t2 = window.setTimeout(dismissCooperadoBootShell, 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return null;
}
