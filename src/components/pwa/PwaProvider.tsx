"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";

const DISMISS_KEY = "hb-coop-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaProvider() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registro opcional em dev sem HTTPS */
      });
    }

    const dismissed = localStorage.getItem(DISMISS_KEY);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = isIos && !/(crios|fxios)/i.test(navigator.userAgent);
    if (isSafari && !dismissed) {
      setIosHint(true);
      setVisible(true);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (localStorage.getItem(DISMISS_KEY)) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIosHint(false);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
    setDeferredPrompt(null);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible || isStandalone()) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-green-900 text-white rounded-2xl shadow-xl border border-green-700 p-4">
        <div className="flex items-start gap-3">
          <AppIcon size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight">Instalar HB Cooperativas</p>
            <p className="text-sm text-green-100 mt-1">
              {iosHint
                ? "No iPhone: toque em Compartilhar e depois em Adicionar à Tela de Início."
                : "Adicione o app à tela inicial para abrir como atalho, sem precisar do navegador."}
            </p>
            {!iosHint && deferredPrompt && (
              <Button size="sm" className="mt-3 bg-white text-green-900 hover:bg-green-50" onClick={install}>
                Instalar app
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="p-1 rounded-lg hover:bg-green-800 shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
