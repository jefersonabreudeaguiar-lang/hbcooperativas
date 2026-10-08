"use client";

import { useEffect, useRef } from "react";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { applyOfficialReleaseIfNeeded } from "@/lib/pwa/fetchOfficialClientRelease";

const MIN_GAP_MS = 8_000;

/**
 * Keep-alive mantém o mesmo documento/JS — ao trocar aba, checa se já saiu release novo (sem polling).
 */
export function useCooperadoReleaseAlignOnTabPath(pathname: string): void {
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (!isCooperadoPwaMessengerMode()) return;
    const now = Date.now();
    if (now - lastCheckRef.current < MIN_GAP_MS) return;
    lastCheckRef.current = now;
    void applyOfficialReleaseIfNeeded();
  }, [pathname]);
}
