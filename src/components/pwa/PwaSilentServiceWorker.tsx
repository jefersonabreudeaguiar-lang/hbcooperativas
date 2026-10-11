"use client";

import { useEffect } from "react";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  isPwaColdStartWindow,
  shouldAutoAlignClientRelease,
  shouldSkipServiceWorkerActivationReload,
} from "@/lib/pwa/clientRelease";
import { runClientReleaseShield } from "@/lib/pwa/clientReleaseShield";
import { registerHbServiceWorker } from "@/lib/pwa/registerHbServiceWorker";

function activateWaitingWorker(reg: ServiceWorkerRegistration) {
  if (shouldSkipServiceWorkerActivationReload() || isPwaColdStartWindow()) return;
  const worker = reg.waiting ?? reg.installing;
  if (!worker) return;
  worker.postMessage({ type: "SKIP_WAITING" });
}

function scheduleActivateWaitingWorker(reg: ServiceWorkerRegistration) {
  if (shouldSkipServiceWorkerActivationReload() || isPwaColdStartWindow()) {
    const delay = Math.max(500, 18_000 - performance.now());
    window.setTimeout(() => {
      if (!shouldSkipServiceWorkerActivationReload() && !isPwaColdStartWindow()) {
        activateWaitingWorker(reg);
      }
    }, delay);
    return;
  }
  activateWaitingWorker(reg);
}

/** Registra SW e recarrega sozinho quando uma nova versão é publicada (sem banner/botão). */
export function PwaSilentServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!shouldAutoAlignClientRelease()) return;

    let reloaded = false;
    let lastSwReloadAt = 0;
    const SW_RELOAD_MIN_GAP_MS = 60_000;
    const onControllerChange = () => {
      if (reloaded) return;
      if (shouldSkipServiceWorkerActivationReload()) return;
      const now = Date.now();
      if (now - lastSwReloadAt < SW_RELOAD_MIN_GAP_MS) return;
      lastSwReloadAt = now;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const registerSw = () => {
      void registerHbServiceWorker().then((reg) => {
        if (!reg) return;
        const onWaiting = () => scheduleActivateWaitingWorker(reg);

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
