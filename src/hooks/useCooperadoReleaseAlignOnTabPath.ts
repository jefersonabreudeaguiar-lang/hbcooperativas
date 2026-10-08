"use client";

import { useEffect, useRef } from "react";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  readCooperadoClientReleaseDiagnostics,
  shouldPromptCooperadoReleaseReload,
} from "@/lib/pwa/cooperadoClientReleaseDiagnostics";
import { alignClientRuntimeToRelease } from "@/lib/pwa/clientRelease";

const MIN_GAP_MS = 12_000;

/**
 * Keep-alive mantém o mesmo documento/JS — ao trocar aba, checa se a nuvem já passou do build local.
 */
export function useCooperadoReleaseAlignOnTabPath(pathname: string): void {
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (!isCooperadoPwaMessengerMode()) return;
    const now = Date.now();
    if (now - lastCheckRef.current < MIN_GAP_MS) return;
    lastCheckRef.current = now;

    void readCooperadoClientReleaseDiagnostics().then((d) => {
      if (!shouldPromptCooperadoReleaseReload(d)) return;
      void alignClientRuntimeToRelease(
        `cooperado_tab:${d.embeddedBuild}->${d.canonicalBuild}`,
        d.canonicalDeploymentId,
        { hard: false, targetBuild: d.canonicalBuild }
      );
    });
  }, [pathname]);
}
