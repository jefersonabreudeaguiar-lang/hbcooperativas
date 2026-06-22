"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { useAuth } from "@/modules/auth/AuthProvider";

const DISMISS_COUNT_KEY = "hb-coop-pwa-install-dismiss-count";
const LEGACY_DISMISS_KEY = "hb-coop-pwa-install-dismissed";
const COOPERADO_MIN_PROMPTS = 3;

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

function readDismissCount(): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem(DISMISS_COUNT_KEY);
  if (stored != null) {
    const n = parseInt(stored, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (localStorage.getItem(LEGACY_DISMISS_KEY)) return 1;
  return 0;
}

function writeDismissCount(count: number) {
  localStorage.setItem(DISMISS_COUNT_KEY, String(count));
  localStorage.removeItem(LEGACY_DISMISS_KEY);
}

function maxDismissals(isCooperado: boolean): number {
  return isCooperado ? COOPERADO_MIN_PROMPTS : 1;
}

function shouldShowPrompt(isCooperado: boolean): boolean {
  return readDismissCount() < maxDismissals(isCooperado);
}

export function PwaProvider() {
  const { user, loading } = useAuth();
  const isCooperado = user?.role === "cooperado";
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);

  useEffect(() => {
    if (loading || isStandalone() || !shouldShowPrompt(isCooperado)) {
      setVisible(false);
      return;
    }

    setDismissCount(readDismissCount());

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registro opcional em dev sem HTTPS */
      });
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = isIos && !/(crios|fxios)/i.test(navigator.userAgent);
    if (isSafari) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    setIosHint(false);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (!shouldShowPrompt(isCooperado)) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIosHint(false);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [isCooperado, loading]);

  const dismiss = () => {
    const next = readDismissCount() + 1;
    writeDismissCount(next);
    setDismissCount(next);
    setVisible(false);
    setDeferredPrompt(null);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      writeDismissCount(maxDismissals(isCooperado));
      setVisible(false);
      return;
    }
    dismiss();
  };

  if (!visible || isStandalone()) return null;

  const maxShows = maxDismissals(isCooperado);
  const currentShow = Math.min(dismissCount + 1, maxShows);

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
            {isCooperado && (
              <p className="text-xs text-green-200/90 mt-2">
                Aviso {currentShow} de {maxShows} — instale o app para acessar mais rápido.
              </p>
            )}
            {!iosHint && deferredPrompt && (
              <Button size="sm" variant="inverse" className="mt-3 font-semibold" onClick={install}>
                Instalar app
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="p-1 rounded-lg hover:bg-green-800 shrink-0"
            aria-label={isCooperado ? `Fechar aviso ${currentShow} de ${maxShows}` : "Fechar"}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
