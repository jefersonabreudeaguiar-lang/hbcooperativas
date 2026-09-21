"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Avisa quando há build novo no servidor (PWA / cache antigo). */
export function AppUpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const key = "hb-coop-app-build-seen";
    const seen = localStorage.getItem(key);
    if (seen !== String(APP_BUILD_VERSION)) {
      if (seen != null) setShow(true);
      localStorage.setItem(key, String(APP_BUILD_VERSION));
    }

    void navigator.serviceWorker.register(`/sw.js?build=${APP_BUILD_VERSION}`).then((reg) => {
      const onUpdate = () => {
        const w = reg.installing ?? reg.waiting;
        if (!w) return;
        const check = () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) setShow(true);
        };
        w.addEventListener("statechange", check);
        check();
      };
      reg.addEventListener("updatefound", onUpdate);
      if (reg.waiting && navigator.serviceWorker.controller) setShow(true);
    });
  }, []);

  if (!show) return null;

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
