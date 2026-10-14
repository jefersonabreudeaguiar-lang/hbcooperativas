"use client";

import { useLayoutEffect } from "react";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

/** Garante remoção do shell estático mesmo se auth ou chunks atrasarem (ex.: preview estreito no Cursor). */
export function CooperadoBootShellDismiss() {
  useLayoutEffect(() => {
    dismissCooperadoBootShell();
  }, []);

  return null;
}
