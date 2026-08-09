"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { useAuth } from "@/modules/auth/AuthProvider";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  detectDevicePlatform,
  isIosNonSafari,
  type DevicePlatform,
} from "@/components/pwa/BaixarAppGuide";
import { registrarAcessoCooperadoApp } from "@/services/cooperadoAppInstallService";
import { getData } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";

/** v2 — reexibe o aviso de baixar o app para quem já tinha fechado a versão antiga. */
const DISMISS_COUNT_KEY = "hb-coop-pwa-install-dismiss-count-v2";
const LEGACY_DISMISS_KEYS = [
  "hb-coop-pwa-install-dismiss-count",
  "hb-coop-pwa-install-dismissed",
];
const COOPERADO_MIN_PROMPTS = 5;

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
  // Não herda contagem antiga — força mostrar de novo o “Baixar app”.
  for (const key of LEGACY_DISMISS_KEYS) localStorage.removeItem(key);
  return 0;
}

function writeDismissCount(count: number) {
  localStorage.setItem(DISMISS_COUNT_KEY, String(count));
  for (const key of LEGACY_DISMISS_KEYS) localStorage.removeItem(key);
}

function maxDismissals(isCooperado: boolean): number {
  return isCooperado ? COOPERADO_MIN_PROMPTS : 1;
}

function shouldShowPrompt(isCooperado: boolean, forcarPorFaltaDeApp: boolean): boolean {
  if (forcarPorFaltaDeApp) return true;
  return readDismissCount() < maxDismissals(isCooperado);
}

function bannerCopy(platform: DevicePlatform, nonSafariIos: boolean): string {
  if (platform === "ios") {
    if (nonSafariIos) {
      return "No iPhone, abra este site no Safari → Compartilhar → Adicionar à Tela de Início.";
    }
    return "No iPhone: toque em Compartilhar e depois em Adicionar à Tela de Início.";
  }
  if (platform === "android") {
    return "No Android: toque em Instalar app ou use o menu ⋮ → Instalar app / Adicionar à tela inicial.";
  }
  return "Disponível para Android e iPhone — adicione à tela inicial e abra como aplicativo.";
}

export function PwaProvider() {
  const { user, loading } = useAuth();
  const isCooperado = user?.role === "cooperado";
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>("other");
  const [nonSafariIos, setNonSafariIos] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);

  useEffect(() => {
    if (loading || !user?.cooperadoId) return;
    const data = getData();
    const coopId = getUserCooperativaId(user, data);
    const coop = data.cooperativas.find((c) => c.id === coopId);
    const cnpj = normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
    registrarAcessoCooperadoApp({
      cooperadoId: user.cooperadoId,
      cnpj: cnpj.length === 14 ? cnpj : undefined,
      email: user.email,
    });
  }, [loading, user?.id, user?.cooperadoId, user?.email, user?.cooperativaCnpj, user?.cooperativaId]);

  useEffect(() => {
    if (loading) return;

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register(`/sw.js?build=${APP_BUILD_VERSION}`)
        .then((reg) => {
          void reg.update();
          reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        })
        .catch(() => {
          /* registro opcional em dev sem HTTPS */
        });
    }

    if (isStandalone()) {
      setVisible(false);
      return;
    }

    const data = getData();
    const registro = user?.cooperadoId
      ? data.cooperados.find((c) => c.id === user.cooperadoId)
      : undefined;
    const jaMarcadoComApp = Boolean(registro?.appInstaladoEm);
    // Cooperado ativo sem app: reabre o aviso mesmo se já tinha fechado antes.
    const forcarPorFaltaDeApp = Boolean(isCooperado && !jaMarcadoComApp);

    if (!shouldShowPrompt(isCooperado, forcarPorFaltaDeApp)) {
      setVisible(false);
      return;
    }

    setDismissCount(readDismissCount());
    const detected = detectDevicePlatform();
    setPlatform(detected);
    setNonSafariIos(isIosNonSafari());

    // iPhone/iPad: sempre mostra instruções (Safari A2HS).
    if (detected === "ios" || forcarPorFaltaDeApp) {
      setVisible(true);
      if (detected === "ios") return;
    }

    // Android/desktop: banner quando o Chrome oferecer instalação; senão mostra fallback.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (!shouldShowPrompt(isCooperado, forcarPorFaltaDeApp)) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Fallback Android: se o evento não vier em alguns segundos, mostra o guia mesmo assim.
    const fallbackTimer = window.setTimeout(() => {
      if (!shouldShowPrompt(isCooperado, forcarPorFaltaDeApp)) return;
      if (detected === "android" || forcarPorFaltaDeApp) setVisible(true);
    }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.clearTimeout(fallbackTimer);
    };
  }, [isCooperado, loading, user?.cooperadoId]);

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
  const isIos = platform === "ios";

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-green-900 text-white rounded-2xl shadow-xl border border-green-700 p-4">
        <div className="flex items-start gap-3">
          <AppIcon size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight">Baixar aplicativo</p>
            <p className="text-sm text-green-100 mt-1">{bannerCopy(platform, nonSafariIos)}</p>
            {isCooperado && (
              <p className="text-xs text-green-200/90 mt-2">
                Aviso {currentShow} de {maxShows} — instale o app para acessar mais rápido.
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {!isIos && deferredPrompt && (
                <Button size="sm" variant="inverse" className="font-semibold" onClick={install}>
                  Instalar no Android
                </Button>
              )}
              <Link
                href="/baixar-app"
                onClick={() => setVisible(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-800 hover:bg-green-700 px-3 py-2 text-sm font-semibold text-white border border-green-600"
              >
                <Download size={14} />
                {isIos ? "Ver passos no iPhone" : "Android e iPhone"}
              </Link>
            </div>
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
