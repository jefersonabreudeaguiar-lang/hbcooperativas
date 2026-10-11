"use client";

import { useEffect } from "react";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { shouldAutoAlignClientRelease } from "@/lib/pwa/clientRelease";
import { registerHbServiceWorker } from "@/lib/pwa/registerHbServiceWorker";

/**
 * PWA instalado: aplica tombstone /sw.js (sem fetch) para expulsar SW legado no aparelho.
 * Atualização de versão fica no ClientReleaseShieldHost.
 */
export function PwaSilentServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!shouldAutoAlignClientRelease()) return;

    const purgeLegacySw = () => {
      void registerHbServiceWorker();
    };

    if (isCooperadoPwaMessengerMode()) {
      scheduleCooperadoPostInteractiveTask(purgeLegacySw);
    } else {
      purgeLegacySw();
    }
  }, []);

  return null;
}
