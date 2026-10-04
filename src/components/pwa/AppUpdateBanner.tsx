"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoAppUser } from "@/permissions";
import { BUILD_SEEN_KEY } from "@/lib/pwa/clientRelease";

const COOP_SW_RELOADED_BUILD_KEY = "hb-coop-sw-reloaded-build";

function activateWaitingWorker(reg: ServiceWorkerRegistration) {
  const worker = reg.waiting ?? reg.installing;
  if (!worker) return;
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** Cooperado: atualiza PWA sozinho. Equipe: banner opcional para recarregar. */
export function AppUpdateBanner() {
  const { user, accountUser } = useAuth();
  const autoUpdate = isCooperadoAppUser(accountUser ?? user);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const seen = localStorage.getItem(BUILD_SEEN_KEY);
    if (seen !== String(APP_BUILD_VERSION) && seen != null && !autoUpdate) {
      setShow(true);
    }

    let reloaded = false;
    const onControllerChange = () => {
      if (!autoUpdate || reloaded) return;
      const buildKey = String(APP_BUILD_VERSION);
      if (sessionStorage.getItem(COOP_SW_RELOADED_BUILD_KEY) === buildKey) return;
      sessionStorage.setItem(COOP_SW_RELOADED_BUILD_KEY, buildKey);
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.register(`/sw.js?build=${APP_BUILD_VERSION}`).then((reg) => {
      const onWaiting = () => {
        if (autoUpdate) {
          if (sessionStorage.getItem(COOP_SW_RELOADED_BUILD_KEY) === String(APP_BUILD_VERSION)) return;
          activateWaitingWorker(reg);
          return;
        }
        if (navigator.serviceWorker.controller) setShow(true);
      };

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
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [autoUpdate]);

  if (autoUpdate || !show) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-2 shadow-md safe-area-pt">
      <span>Há uma versão nova do app (build {APP_BUILD_VERSION}). Atualize para ver todas as funções.</span>
      <Button
        size="sm"
        variant="secondary"
        className="bg-white/90 border-amber-800 text-amber-950"
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={14} /> Atualizar agora
      </Button>
    </div>
  );
}
