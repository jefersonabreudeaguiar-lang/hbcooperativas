"use client";

import { useEffect } from "react";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { registerHbServiceWorker } from "@/lib/pwa/registerHbServiceWorker";

/**
 * PWA instalado: substitui SW legado por /sw.js de passthrough (navigate → rede).
 * Atualização de versão fica no ClientReleaseShieldHost.
 */
export function PwaSilentServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

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
