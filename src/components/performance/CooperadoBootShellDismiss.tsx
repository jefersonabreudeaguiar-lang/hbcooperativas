"use client";

import { useLayoutEffect } from "react";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";

/** Igual v552: some o splash assim que o React monta. */
export function CooperadoBootShellDismiss() {
  useLayoutEffect(() => {
    dismissCooperadoBootShell();
  }, []);

  return null;
}
