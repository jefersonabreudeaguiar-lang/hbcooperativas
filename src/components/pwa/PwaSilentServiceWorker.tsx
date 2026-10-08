"use client";

import { useEffect } from "react";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

function activateWaitingWorker(reg: ServiceWorkerRegistration) {
  const worker = reg.waiting ?? reg.installing;
  if (!worker) return;
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** Registra SW e recarrega sozinho quando uma nova versão é publicada (sem banner/botão). */
export function PwaSilentServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
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

        reg.addEventListener("updatefound", onUpdate);
        if (reg.waiting && navigator.serviceWorker.controller) onWaiting();
        void reg.update();
      });
    };

    registerSw();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
