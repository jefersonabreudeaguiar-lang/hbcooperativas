"use client";

import { useEffect, useState } from "react";
import { CooperadoInicioCardPersistBootstrap } from "@/components/cooperado/CooperadoInicioCardPersistBootstrap";
import { HbCreditAccountPersistBootstrap } from "@/components/hb-credit/HbCreditAccountPersistBootstrap";
import { HbFichaBaseOperacionalMarker } from "@/components/hb-credit/HbFichaBaseOperacionalMarker";
import { CooperadoMobilePerfBootstrap } from "@/components/performance/CooperadoMobilePerfBootstrap";
import { EntregaAprovadaNotifier } from "@/components/cooperado/EntregaAprovadaNotifier";
import { ComunicadoNotifier } from "@/components/cooperado/ComunicadoNotifier";

const IDLE_TIMEOUT_MS = 900;

/**
 * Bootstraps não críticos para o 1º paint — reduz cold start e long tasks na abertura.
 */
export function AppIdleSecondaryBootstraps() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = () => setReady(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 400);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    <>
      <CooperadoMobilePerfBootstrap />
      <CooperadoInicioCardPersistBootstrap />
      <HbCreditAccountPersistBootstrap />
      <HbFichaBaseOperacionalMarker />
      <EntregaAprovadaNotifier />
      <ComunicadoNotifier />
    </>
  );
}
