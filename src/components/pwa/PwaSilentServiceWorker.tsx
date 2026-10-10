"use client";

import { useEffect } from "react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { shouldAutoAlignClientRelease, shouldSkipServiceWorkerActivationReload } from "@/lib/pwa/clientRelease";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";

function activateWaitingWorker(reg: ServiceWorkerRegistration) {
  const worker = reg.waiting ?? reg.installing;
  if (!worker) return;
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** Registra SW e recarrega sozinho quando uma nova versão é publicada (sem banner/botão). */
export function PwaSilentServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!shouldAutoAlignClientRelease()) return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      if (shouldSkipServiceWorkerActivationReload()) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const registerSw = () => {
      void navigator.serviceWorker.register(`/sw.js?build=${APP_BUILD_VERSION}`).then((reg) => {
        const onWaiting = () => activateWaitingWorker(reg);

        const onUpdate = () => {
          const w = reg.installing ?? reg.waiting;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) onWaiting();
          });
          if (w.state === "installed" && navigator.serviceWorker.controller) onWaiting();
        };

        reg.addEventListener("updatefound", () => {
          onUpdate();
          void runClientReleaseShield("sw_updatefound");
        });
        if (reg.waiting && navigator.serviceWorker.controller) onWaiting();
        void reg.update();
      });
    };

    if (isCooperadoPwaMessengerMode()) {
      scheduleCooperadoPostInteractiveTask(registerSw);
    } else {
      registerSw();
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.serviceWorker.getRegistration().then((reg) => {
        void reg?.update();
        void runClientReleaseShield("sw_visibility");
      });
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
